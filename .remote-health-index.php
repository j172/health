<?php
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($path, '/api/admin/')) {
    @set_time_limit(290);
}

// Secrets live in .env (deployed separately via the .pixabay.env merge, never
// committed) — this file is public on GitHub, so a hardcoded key here is a
// live credential leak the moment it's committed. Previously WAS hardcoded
// (health-ops-20260725-rebuild) and a stale hardcoded RSS_SYNC_SECRET
// placeholder below; both fixed to read from .env instead.
//
// .pixabay.env is checked as a higher-priority override, not just .env:
// FTP upload of a fresh .pixabay.env happens *before* apply-prebuilt-force
// is called, but that call is what merges .pixabay.env into .env (inside
// buildPrebuiltCommand, below) — so on the deploy that first introduces a
// new key, .env on disk is still stale at the exact moment this key check
// runs. Reading the freshly-uploaded .pixabay.env first closes that gap
// without ever needing a hardcoded fallback secret.
$readEnvVar = static function (string $name): string {
    static $envVars = null;
    if ($envVars === null) {
        $envVars = [];
        foreach (['/home/tw123457/health_app/.env', '/home/tw123457/health_app/.pixabay.env'] as $envFile) {
            if (is_file($envFile)) {
                foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                    if (preg_match('/^([A-Z_]+)=(.*)$/', $line, $m)) {
                        $envVars[$m[1]] = $m[2];
                    }
                }
            }
        }
    }
    return $envVars[$name] ?? '';
};

$opsKey = $readEnvVar('OPS_KEY');
// Push channel for the apply-prebuilt consecutive-failure alert below (see
// $failAlertThreshold in $buildPrebuiltCommand) — a free ntfy.sh topic, not
// an authenticated channel, so its unguessability *is* its access control;
// treat it like a secret. Empty when NTFY_TOPIC isn't set in .env, which
// silently disables the alert (no crash, no notification) rather than
// erroring — this endpoint's core self-heal job must never depend on
// notification config being present.
$ntfyUrl = ($ntfyTopic = $readEnvVar('NTFY_TOPIC')) !== '' ? 'https://ntfy.sh/' . rawurlencode($ntfyTopic) : '';

// ---------------------------------------------------------------------------
// NPROC gate — issue #98 / SPEC-HEALTH-20260831-PM2-PROLIFERATION
//
// The account's NPROC limit is 100 (hosting support, in writing; the "20 Entry
// Processes" figure in older notes is a *different* CloudLinux limit and is not
// the one that blows). Every pm2 CLI call that cannot reach the live daemon
// starts another daemon, and the watchdog's failure path made five such calls
// every five minutes for as long as the app stayed down. Over the 4h39m outage
// of 2026-08-31 that is ~56 escalations x 5 spawns: the daemons then held the
// slots the next escalation needed, so the recovery mechanism became the load.
//
// So: before anything that spawns a process, count this account's processes and
// refuse to spawn when the table is already crowded. The count MUST be readable
// when nothing can fork — that is the only condition it exists for — so it comes
// from listing /proc and reading /proc/<pid>/status, which are a directory read
// and a file read. Nothing here shells out to ps, wc, pgrep or anything else.
//
// This is deliberately NOT a "give up after N failures" cap (explicitly rejected
// in the spec): the gate closes only while the process table is actually full
// and reopens by itself the moment the count drops, so a recoverable app whose
// process table is healthy is never abandoned.
$nprocLimit = 100;
// Headroom threshold.
//
// MEASURED BASELINE = 7. This is the number the ceiling is derived from, and
// the reason it changed. /__ops/pm2-status, first production reading, taken
// immediately after the 2026-08-31 13:45 deploy with the site healthy:
//
//   process_count = 7   ceiling = 70   nproc_limit = 100   blocking = no
//     1449687  lsphp
//     1449721  PM2 God Daemon
//     1449746  pm2-logrotate
//     1452121  next-server (v16.3.0)    <- bid-web
//     1682033  next-server (v16.2.12)   <- health-web
//
// The original 70 was sized against an ESTIMATED steady state of 25-40, on the
// reasoning that a healthy account sat at roughly half the ceiling. The
// estimate was wrong by 4-6x: the real healthy account is 7 processes, so 70
// let it reach TEN TIMES its healthy size before declining to spawn. A gate
// that only fires at 10x baseline fires long after the accumulation it exists
// to stop has started, and (in the 2026-08-31 incident) after the slots a
// permitted escalation needs are already spoken for.
//
// Re-derived from the measurement:
//
//   worst legitimate concurrent occupancy
//     7   measured healthy baseline
//   + 5   one watchdog escalation: pm2 jlist, pm2 kill, pkill, pm2 resurrect,
//         a second pm2 jlist — each a node process
//   + 15  the apply-prebuilt run it triggers, at peak: the nohup wrapper shell,
//         tar, find/grep, pm2 delete, setsid pm2 start, the new next-server and
//         its node threads, two curls (10-15 concurrent tasks)
//   + 3   lsphp workers that must keep serving this very request and cron
//   = 30  everything legitimate, all at once, worst case
//
//   ceiling 35  = 30 + 5 slots of slack, so the gate can never block a healthy
//                 account even mid-escalation. 5x the measured baseline of 7
//                 (the old 70 was 10x).
//   100 - 35    = 65 free slots at the instant the gate closes, ~2.8x the ~23
//                 an escalation-plus-apply needs at peak. So a PERMITTED
//                 escalation (count just under 35) always has room to finish —
//                 the constraint the old comment cited for keeping 70 high is
//                 satisfied with a large margin at 35.
//
// If you change this number, change the measurement above it first. The last
// time it was set from an estimate rather than a reading it was out by 10x.
$nprocEscalationCeiling = 35;

// Reads one "Key:\tvalue" line out of a /proc status-style file. A file read;
// it spawns nothing. $maxLen keeps this cheap when it runs over every pid.
$readProcField = static function (string $file, string $key, int $maxLen = 8192): ?string {
    $raw = @file_get_contents($file, false, null, 0, $maxLen);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $keyLen = strlen($key);
    foreach (explode("\n", $raw) as $line) {
        if (strncmp($line, $key, $keyLen) === 0) {
            return trim(substr($line, $keyLen));
        }
    }
    return null;
};

// ---------------------------------------------------------------------------
// Process liveness, from /proc/<pid>/stat's STATE character — issue #97.
//
// `is_dir("/proc/{$pid}")` is not a liveness test. /proc/<pid> persists for a
// process that has been killed but not yet reaped by its parent (state 'Z',
// zombie), so a *successful* kill reads as a failure. That is not theoretical:
// on 2026-08-31 apply-prebuilt-force refused to spawn a replacement because
// "pid 611802 is still running and could not be killed", and hosting support's
// process list from later in the same outage contains 639986 but not 611802.
// The kill had landed. The account could recover and the code said it could
// not, so the 4h39m outage continued.
//
// A zombie holds a slot in the process table until it is reaped, so the NPROC
// *gate* is right to count it (see $scanOwnProcesses, which deliberately still
// counts every /proc entry). But it will never execute another instruction, so
// for "did my kill work" and "is a run still in flight" it is dead.
//
// Parsing note (this is the whole reason for reading the file by hand): field 2
// of /proc/<pid>/stat is the executable name wrapped in parentheses, and the
// kernel does NOT escape what is inside it. A process named `sh -c (a b)` or
// `my )app(` produces a field 2 containing spaces AND parentheses, so splitting
// the line on whitespace, or on the FIRST ')', puts the wrong character in
// field 3. Everything after the LAST ')' is unambiguous — that suffix always
// begins with " <state> <ppid> ..." — so we locate strrpos($raw, ')') and read
// the first token after it. This mirrors the descendant scan in
// $killPrebuiltRun, which already parsed this way.
//
// Returns the single state character, or null when the pid has no readable
// stat file — i.e. the process is gone (or was never ours), which for every
// caller here means the same thing as dead.
$readProcState = static function (int $pid): ?string {
    if ($pid <= 0) {
        return null;
    }
    // No clearstatcache() needed, and that is a second reason to read the file
    // rather than stat the directory: file_get_contents() is not served from
    // PHP's stat cache, so polling this in a loop always sees the current
    // kernel state. is_dir() in a loop would have kept returning its own first
    // answer. comm is kernel-capped at 16 bytes, so 4096 always reaches the
    // state character.
    $raw = @file_get_contents("/proc/{$pid}/stat", false, null, 0, 4096);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $close = strrpos($raw, ')');
    if ($close === false) {
        return null;
    }
    $rest = ltrim(substr($raw, $close + 1));
    if ($rest === '') {
        return null;
    }
    return $rest[0];
};

// True when $pid cannot run any more code: gone, a zombie awaiting reaping, or
// the kernel's transient 'X'/'x' "dead" states.
$procIsDead = static function (int $pid) use ($readProcState): bool {
    $state = $readProcState($pid);
    return $state === null || $state === 'Z' || $state === 'X' || $state === 'x';
};

// Human-readable state for log lines and refusal messages. #97 took two days
// and a hosting-support process list to reconstruct what a single word here
// would have said outright, so every path that reports "could not be killed"
// now reports what it actually observed.
$describeProcState = static function (int $pid) use ($readProcState): string {
    $state = $readProcState($pid);
    if ($state === null) {
        return 'gone (no /proc entry)';
    }
    $names = [
        'R' => 'running',
        'S' => 'sleeping (interruptible)',
        'D' => 'uninterruptible sleep',
        'Z' => 'ZOMBIE — already dead, awaiting reaping',
        'T' => 'stopped',
        't' => 'tracing stop',
        'X' => 'dead',
        'x' => 'dead',
        'I' => 'idle kernel thread',
    ];
    return $state . ' (' . ($names[$state] ?? 'unrecognised state') . ')';
};

// This process's real uid, from /proc/self/status — not posix_getuid(), which
// lives in the same ext-posix whose availability is exactly what #97 says we
// cannot assume. getmyuid() (the owner of this script file) is only a fallback.
$ownUid = static function () use ($readProcField): ?int {
    static $uid = false;
    if ($uid !== false) {
        return $uid;
    }
    $uid = null;
    $line = $readProcField('/proc/self/status', 'Uid:');
    if ($line !== null) {
        $parts = preg_split('/\s+/', $line) ?: [];
        if (isset($parts[0]) && ctype_digit($parts[0])) {
            $uid = (int) $parts[0];
        }
    }
    if ($uid === null) {
        $fallback = @getmyuid();
        if (is_int($fallback) && $fallback >= 0) {
            $uid = $fallback;
        }
    }
    return $uid;
};

// Every process owned by this account, read straight out of /proc. Returns null
// — never a wrong number — when the answer cannot be trusted, so every caller
// can fail OPEN: a gate that blocks on a bad reading would keep a recoverable
// app down, which is worse than the problem it guards against.
//
// 'age' comes from the mtime of /proc/<pid>, which on Linux is the process start
// time. A stat(), so still no fork.
$scanOwnProcesses = static function () use ($ownUid, $readProcField): ?array {
    $uid = $ownUid();
    if ($uid === null) {
        return null;
    }
    $entries = @glob('/proc/[0-9]*', GLOB_ONLYDIR);
    if (!is_array($entries) || $entries === []) {
        return null;
    }
    if (count($entries) > 4000) {
        // /proc is not namespaced for this account the way we assume; a count
        // taken here would not mean what the gate thinks it means.
        return null;
    }
    clearstatcache();
    $now = time();
    $procs = [];
    foreach ($entries as $dir) {
        $pid = (int) basename($dir);
        if ($pid <= 0) {
            continue;
        }
        $statusFile = $dir . '/status';
        $uidLine = $readProcField($statusFile, 'Uid:');
        if ($uidLine === null) {
            continue; // exited between the glob and the read, or not ours to read
        }
        $uidParts = preg_split('/\s+/', $uidLine) ?: [];
        if (!isset($uidParts[0]) || (int) $uidParts[0] !== $uid) {
            continue;
        }
        $cmdRaw = @file_get_contents($dir . '/cmdline', false, null, 0, 4096);
        $cmdline = is_string($cmdRaw) ? trim(str_replace("\0", ' ', $cmdRaw)) : '';
        if ($cmdline === '') {
            $name = $readProcField($statusFile, 'Name:');
            $cmdline = '[' . ($name === null ? 'unknown' : $name) . ']';
        }
        $ppidLine = $readProcField($statusFile, 'PPid:');
        $started = @filemtime($dir);
        $procs[] = [
            'pid' => $pid,
            'ppid' => $ppidLine === null ? 0 : (int) $ppidLine,
            'cmdline' => $cmdline,
            'age' => is_int($started) ? max(0, $now - $started) : 0,
        ];
    }
    return $procs;
};

// The gate itself. Memoised per request (pass true to re-read after reaping).
// 'count' === null means "unknown", and 'blocking' is then false — fail open.
$processGate = static function (bool $refresh = false) use ($scanOwnProcesses, $nprocLimit, $nprocEscalationCeiling): array {
    static $cache = null;
    if ($cache !== null && !$refresh) {
        return $cache;
    }
    $procs = $scanOwnProcesses();
    if ($procs === null) {
        $cache = [
            'count' => null,
            'procs' => [],
            'limit' => $nprocLimit,
            'ceiling' => $nprocEscalationCeiling,
            'blocking' => false,
            'note' => "process count UNAVAILABLE (/proc unreadable or uid undetermined) — failing open, escalation allowed (ceiling {$nprocEscalationCeiling}, NPROC {$nprocLimit})",
        ];
        return $cache;
    }
    $count = count($procs);
    $blocking = ($count >= $nprocEscalationCeiling);
    $cache = [
        'count' => $count,
        'procs' => $procs,
        'limit' => $nprocLimit,
        'ceiling' => $nprocEscalationCeiling,
        'blocking' => $blocking,
        'note' => $blocking
            ? "process count {$count} >= ceiling {$nprocEscalationCeiling} (NPROC {$nprocLimit}) — escalation BLOCKED; it resumes by itself once the count drops"
            : "process count {$count} < ceiling {$nprocEscalationCeiling} (NPROC {$nprocLimit}) — escalation allowed",
    ];
    return $cache;
};

if (str_starts_with($path, '/__ops/')) {
    // An empty $opsKey (e.g. OPS_KEY missing from .env) must never grant
    // access — otherwise an empty ?key= would satisfy '' !== '' === false.
    if ($opsKey === '' || !hash_equals($opsKey, (string) ($_GET['key'] ?? ''))) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
        exit;
    }

    $appDir = '/home/tw123457/health_app';
    $logFile = $appDir . '/.rebuild-homepage.log';
    $buildLockFile = $appDir . '/.rebuild-homepage.lock';
    $prebuiltLogFile = $appDir . '/.apply-prebuilt.log';
    // .apply-prebuilt.lock is now purely an flock() mutex handle (its
    // *content* is never read) guarding the check-then-spawn critical
    // section below — .apply-prebuilt.pid (written by the spawned script
    // itself, as its very first action) is the actual source of truth for
    // "is a run still alive", checked via /proc, not a bypassable mtime
    // heuristic. See triggerPrebuiltRun()/isPrebuiltRunning() below — this
    // replaces the old scheme where /apply-prebuilt-force unconditionally
    // deleted the lock/log and spawned a new run regardless of whether a
    // previous one was still genuinely mid-flight, which stacked multiple
    // concurrent pm2 delete/start + 150-attempt health-probe loops on top of
    // each other and exhausted the host's process/memory budget on
    // 2026-08-10 (confirmed via a live `ps aux` from hosting support showing
    // a still-running instance from a much earlier trigger).
    $prebuiltLockFile = $appDir . '/.apply-prebuilt.lock';
    $prebuiltPidFile = $appDir . '/.apply-prebuilt.pid';
    $nodeBin = '/home/tw123457/.nvm/versions/node/v20.20.2/bin/node';
    $pm2Bin = $nodeBin . ' /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2';

    // True if the PID last recorded by a spawned apply-prebuilt run is still
    // a live process. Read from /proc without depending on the posix/pcntl
    // extensions (not assumed enabled on this shared host).
    //
    // This used to be `is_dir("/proc/{$pid}")`, which has the #97 zombie bug in
    // its most damaging position: the wrapper's last statement is
    // `rm -f .apply-prebuilt.pid`, so a wrapper that was SIGKILLed never gets
    // to remove its own pid file. Kill it, and until init reaps it there is a
    // live pid file pointing at a /proc entry — and every subsequent
    // /apply-prebuilt and every 5-minute watchdog tick would answer "a restart
    // already appears to be in progress" and decline to start the run that
    // would have brought the site back. $procIsDead treats 'Z' as dead, so the
    // corpse of the run we just killed can no longer block its replacement.
    $isPrebuiltRunning = static function () use ($prebuiltPidFile, $procIsDead): int {
        // triggerPrebuiltRun() now polls this in a loop waiting for a freshly
        // spawned run to appear, and PHP caches is_file()/is_dir() results for
        // the whole request — without this the poll would keep re-reading its
        // own first (negative) answer and never see the new pid.
        clearstatcache();
        if (!is_file($prebuiltPidFile)) {
            return 0;
        }
        $pid = (int) trim((string) @file_get_contents($prebuiltPidFile));
        return ($pid > 0 && !$procIsDead($pid)) ? $pid : 0;
    };

    // Kills a still-running apply-prebuilt instance's descendants (tar, curl,
    // the `pm2 delete`/`pm2 start` invocations at the moment of kill) then the
    // wrapper shell itself. Deliberately does NOT touch pm2/node —
    // the "pm2 start" line inside the script runs under its own `setsid`
    // specifically so the app survives even when this wrapper gets killed;
    // only the wrapper and its transient helpers die.
    // Returns whether the wrapper is actually gone.
    //
    // This used to kill only through exec(), and exec() cannot spawn anything
    // once the account is at its Entry Process ceiling — it fails silently and
    // returns nothing. That is not hypothetical: on 2026-08-23 it left two
    // [START-FORCE-V4] wrappers alive at once, because three stacked deploys
    // each "killed" the previous run without the kill ever running, then
    // spawned a replacement anyway. An unverified force is a process
    // amplifier at the exact moment the account can least afford one, so the
    // caller has to be told whether the kill landed instead of assuming it.
    //
    // Reporting the failure honestly was only half the problem. On 2026-08-29 a
    // wrapper wedged at 06:15 UTC and could not be killed *at all*: every path
    // that could have killed it needed to fork, and the wrapper was holding the
    // slots that forking required. force refused (correctly), the app stayed
    // down, and it took a hosting-support ticket ~4 hours later to break the
    // deadlock. A recovery mechanism that only works while the host is healthy
    // is not a recovery mechanism.
    //
    // So the signals now go through posix_kill(), which is a bare syscall and
    // spawns nothing, and the child list comes from reading /proc rather than
    // from pkill. Both work at the ceiling. exec() survives only as a fallback
    // for a host without ext-posix, where it is no worse than what it replaced.
    //
    // 2026-08-31, the third and worst failure of this function: the signal
    // landed and the VERIFICATION said it had not. See $readProcState above.
    // $observedState is an out-parameter carrying what the final poll actually
    // saw, so the refusal message can say "state R (running)" or "state Z" or
    // "gone" instead of the unfalsifiable "could not be killed".
    $killPrebuiltRun = static function (int $pid, ?string &$observedState = null) use ($procIsDead, $describeProcState): bool {
        $observedState = null;
        $canSignal = function_exists('posix_kill');

        // Descendants, newest-generation-first, resolved entirely from /proc —
        // a directory read, so it costs no processes. pkill -9 -P only ever
        // reached direct children; a tar spawned inside one of the script's
        // `{ ...; }` groups is a grandchild and used to survive.
        $descendants = [];
        if ($canSignal) {
            $childrenOf = [];
            foreach (@glob('/proc/[0-9]*/stat') ?: [] as $statFile) {
                $raw = @file_get_contents($statFile);
                if ($raw === false) {
                    continue; // process exited between the glob and the read
                }
                // Field 2 is the executable name in parentheses and may itself
                // contain spaces or parentheses, so parse after the LAST ')'.
                $close = strrpos($raw, ')');
                if ($close === false) {
                    continue;
                }
                $fields = explode(' ', trim(substr($raw, $close + 1)));
                $ppid = (int) ($fields[1] ?? 0); // [0] is state, [1] is ppid
                $self = (int) basename(dirname($statFile));
                if ($ppid > 0 && $self > 0) {
                    $childrenOf[$ppid][] = $self;
                }
            }
            for ($queue = [$pid]; $queue !== []; ) {
                $current = array_shift($queue);
                foreach ($childrenOf[$current] ?? [] as $child) {
                    $descendants[] = $child;
                    $queue[] = $child;
                }
            }
            // Deepest first, so a parent cannot fork a replacement child in the
            // window between its own death and its children being signalled.
            foreach (array_reverse($descendants) as $descendant) {
                @posix_kill($descendant, 9);
            }
            // 9 as a literal, not the SIGKILL constant: that constant comes from
            // ext-pcntl, not the ext-posix that provides posix_kill(), and an
            // undefined constant is a fatal Error in PHP 8 — which would take
            // this whole ops endpoint down exactly when it is needed most.
            @posix_kill($pid, 9);
        } else {
            @exec('pkill -9 -P ' . $pid . ' 2>&1');
            @exec('kill -9 ' . $pid . ' 2>&1');
        }

        // SIGKILL is delivered synchronously but the process's teardown is not,
        // so give the kernel a moment before reading the state as proof.
        //
        // The single fixed usleep(300000) is replaced by a short backoff that
        // returns the instant the process is dead. Two reasons:
        //
        //   * the common case gets FASTER, not slower — a wrapper that dies
        //     promptly is confirmed at 100ms instead of always costing 300ms;
        //   * the pathological case gets a real budget instead of a guess. 300ms
        //     was chosen with no measurement, on a host whose whole problem is
        //     that it is overloaded; the schedule below waits up to 1.5s in
        //     total before giving up, which is still nothing next to the 4h39m
        //     outage that one premature "no" caused.
        //
        // The first delay is never skipped: the old call site relied on this
        // settle time so a replacement run never races the dying wrapper for
        // the same .apply-prebuilt.log and .apply-prebuilt.pid.
        //
        // 'Dead' here includes 'Z'. A zombie has already run its last
        // instruction — it cannot touch a file, and it cannot be the thing that
        // is "still running".
        foreach ([100000, 100000, 200000, 300000, 400000, 400000] as $delayUs) {
            usleep($delayUs);
            if ($procIsDead($pid)) {
                $observedState = $describeProcState($pid);
                return true;
            }
        }
        $observedState = $describeProcState($pid);
        return false;
    };

    // Straggler reaper — issue #98 §2.5.
    //
    // The 2026-08-31 process list held six Daemon.js, four ProcessContainerFork.js,
    // three wedged `pm2 start ecosystem.config.cjs`, and a `node /bin/timeout
    // update` orphan that had been alive since Aug 29. Nothing ever reaped any of
    // them, so each incident's leftovers were still holding slots during the next.
    //
    // Everything here is decided from /proc (no fork) and signalled with
    // posix_kill when it exists. The exec() fallback is capped, because exec()
    // cannot spawn at the ceiling and burning slots on kills that will not run is
    // the exact failure mode this ticket is about.
    //
    // Safety: this is called only when the app is *already* confirmed not serving
    // on :3000, or explicitly via /__ops/reap-stragglers. It refuses to guess —
    // if the live God Daemon cannot be identified from the pid file it writes
    // itself, no daemon is touched at all, because killing the wrong one takes
    // health-web and bid-web down together.
    $reapStragglers = static function (bool $apply) use ($scanOwnProcesses, $prebuiltPidFile, $procIsDead, $describeProcState): array {
        $result = [
            'ok' => false,
            'applied' => $apply,
            'mechanism' => function_exists('posix_kill') ? 'posix_kill (forkless)' : 'exec kill -9 (needs a fork; capped)',
            'scanned' => 0,
            'god_pid' => 0,
            'candidates' => [],
            'killed' => [],
            'notes' => [],
        ];

        $procs = $scanOwnProcesses();
        if ($procs === null) {
            $result['notes'][] = '/proc not readable — nothing scanned, nothing reaped';
            return $result;
        }
        $result['ok'] = true;
        $result['scanned'] = count($procs);

        $byPid = [];
        foreach ($procs as $p) {
            $byPid[$p['pid']] = $p;
        }

        // Never signal this request's own process or any of its ancestors — that
        // would kill the lsphp worker currently executing this recovery code.
        $protected = [];
        $walk = (int) getmypid(); // int|false — a bare false would silently protect nothing
        for ($i = 0; $i < 64 && $walk > 1; $i++) {
            $protected[$walk] = true;
            $walk = (int) ($byPid[$walk]['ppid'] ?? 0);
        }

        $godPid = 0;
        $godRaw = @file_get_contents('/home/tw123457/.pm2/pm2.pid');
        if (is_string($godRaw)) {
            $candidatePid = (int) trim($godRaw);
            if ($candidatePid > 0 && isset($byPid[$candidatePid]) && stripos($byPid[$candidatePid]['cmdline'], 'Daemon.js') !== false) {
                $godPid = $candidatePid;
            }
        }
        $result['god_pid'] = $godPid;
        if ($godPid === 0) {
            $result['notes'][] = 'live God Daemon not identifiable from ~/.pm2/pm2.pid — duplicate-daemon reaping SKIPPED (refusing to guess which daemon owns the app)';
        }

        $activeApplyPid = 0;
        $applyRaw = @file_get_contents($prebuiltPidFile);
        if (is_string($applyRaw)) {
            $activeApplyPid = (int) trim($applyRaw);
        }

        $keep = static function (array $p) use ($protected, $godPid): bool {
            if (isset($protected[$p['pid']])) {
                return true;
            }
            if ($godPid > 0 && $p['pid'] === $godPid) {
                return true;
            }
            foreach (['next-server', '/next/dist/bin/next', 'lsphp', 'php-fpm', 'sshd', 'systemd', 'cagefs', 'crond'] as $needle) {
                if (stripos($p['cmdline'], $needle) !== false) {
                    return true;
                }
            }
            return false;
        };

        $candidates = [];
        $add = static function (array $p, string $reason) use (&$candidates, $keep): void {
            if ($keep($p) || isset($candidates[$p['pid']])) {
                return;
            }
            $candidates[$p['pid']] = [
                'pid' => $p['pid'],
                'ppid' => $p['ppid'],
                'age' => $p['age'],
                'cmdline' => $p['cmdline'],
                'reason' => $reason,
            ];
        };

        // (1) Duplicate God Daemons, and everything underneath them. A process
        // parented by a duplicate daemon belongs to that daemon, not to the live
        // one, so it goes with it — this is what clears the ProcessContainerFork
        // pile-up in one pass instead of waiting for it to be reparented to init.
        if ($godPid > 0) {
            $childrenOf = [];
            foreach ($procs as $p) {
                $childrenOf[$p['ppid']][] = $p['pid'];
            }
            $queue = [];
            foreach ($procs as $p) {
                if ($p['pid'] !== $godPid && stripos($p['cmdline'], 'Daemon.js') !== false) {
                    $add($p, "duplicate pm2 God Daemon (the live one is {$godPid})");
                    $queue[] = $p['pid'];
                }
            }
            $seen = [];
            while ($queue !== []) {
                $current = (int) array_shift($queue);
                if (isset($seen[$current])) {
                    continue;
                }
                $seen[$current] = true;
                foreach ($childrenOf[$current] ?? [] as $child) {
                    if (isset($byPid[$child]) && !isset($seen[$child])) {
                        $add($byPid[$child], "descendant of duplicate pm2 God Daemon {$current}");
                        $queue[] = $child;
                    }
                }
            }
        }

        // (2) ProcessContainerFork workers reparented to init while a live God
        // Daemon exists. Three conditions, and all three are load-bearing:
        //   - a live daemon was positively identified, so the managed copies of
        //     health-web AND bid-web are its children and are not in this set.
        //     Without that we cannot tell a duplicate from the only worker a
        //     site has, and killing the latter takes down the other site;
        //   - ppid <= 1, so it is genuinely unmanaged, not merely parented by
        //     something we did not resolve;
        //   - six hours old, far past any restart in flight.
        if ($godPid > 0) {
            foreach ($procs as $p) {
                if (stripos($p['cmdline'], 'ProcessContainerFork') === false) {
                    continue;
                }
                if ($p['ppid'] > 1 || $p['age'] < 21600) {
                    continue;
                }
                $add($p, "unmanaged pm2 worker (ppid {$p['ppid']}, live daemon is {$godPid}), alive {$p['age']}s");
            }
        }

        // (3) pm2 CLI invocations that never returned. Three of these were live
        // in the incident list. A `pm2 start` still running after 30 minutes is
        // wedged on a socket, not working.
        foreach ($procs as $p) {
            $cmd = $p['cmdline'];
            if (stripos($cmd, '/pm2/bin/pm2') === false) {
                continue;
            }
            if (stripos($cmd, 'Daemon.js') !== false || stripos($cmd, 'God Daemon') !== false || stripos($cmd, 'ProcessContainerFork') !== false) {
                continue;
            }
            if ($p['age'] < 1800) {
                continue;
            }
            $add($p, "pm2 CLI invocation wedged for {$p['age']}s");
        }

        // (4) apply-prebuilt wrappers that are not the currently recorded run and
        // have outlived any plausible run (the health probe budget is 150s plus
        // extract and swap; two hours is far past it).
        foreach ($procs as $p) {
            if (stripos($p['cmdline'], '.apply-prebuilt') === false) {
                continue;
            }
            if ($activeApplyPid > 0 && $p['pid'] === $activeApplyPid) {
                continue;
            }
            if ($p['age'] < 7200) {
                continue;
            }
            $add($p, "stale apply-prebuilt wrapper, alive {$p['age']}s");
        }

        // (5) The `node /bin/timeout update` class of orphan: parented by init,
        // hours old, and not the app.
        foreach ($procs as $p) {
            if ($p['ppid'] > 1 || $p['age'] < 3600) {
                continue;
            }
            $cmd = $p['cmdline'];
            $isTimeoutWrapper = (stripos($cmd, '/bin/timeout') !== false);
            $isPm2Update = (stripos($cmd, 'pm2') !== false && stripos($cmd, 'update') !== false);
            if (!$isTimeoutWrapper && !$isPm2Update) {
                continue;
            }
            $add($p, "orphaned helper, ppid {$p['ppid']}, alive {$p['age']}s");
        }

        $result['candidates'] = array_values($candidates);
        if (!$apply || $candidates === []) {
            return $result;
        }

        $usePosix = function_exists('posix_kill');
        $execBudget = 8;
        foreach ($candidates as $pid => $info) {
            if ($usePosix) {
                // 9 as a literal: SIGKILL comes from ext-pcntl, not ext-posix,
                // and an undefined constant is a fatal Error in PHP 8.
                @posix_kill((int) $pid, 9);
                $result['killed'][] = (int) $pid;
            } elseif ($execBudget > 0) {
                $execBudget--;
                @exec('kill -9 ' . (int) $pid . ' 2>&1');
                $result['killed'][] = (int) $pid;
            } else {
                $result['notes'][] = "pid {$pid} not signalled — exec() kill budget exhausted (no posix_kill on this host, see #97)";
            }
        }

        usleep(200000);
        clearstatcache();
        foreach ($result['killed'] as $pid) {
            // Same #97 correction as $killPrebuiltRun: a /proc entry is not a
            // live process. A reaped-pending zombie here is a signal that DID
            // land, and reporting it as "the signal did not land" is how a
            // working recovery path gets mistaken for a broken one. (This
            // reaper is still observe-only on the watchdog path — see #98;
            // this changes only what it says about kills it did make.)
            if (!$procIsDead((int) $pid)) {
                $result['notes'][] = "pid {$pid} STILL ALIVE after SIGKILL, state " . $describeProcState((int) $pid) . " — the signal did not land";
            }
        }

        return $result;
    };

    // One-line-per-candidate rendering, shared by the watchdog log and
    // /__ops/pm2-status so both tell the same story.
    $reapSummary = static function (array $reap): string {
        $lines = [];
        $lines[] = 'reap: applied=' . ($reap['applied'] ? 'yes' : 'no (dry run)')
            . ' mechanism=' . $reap['mechanism']
            . ' scanned=' . $reap['scanned']
            . ' god_pid=' . ($reap['god_pid'] ?: 'unknown')
            . ' candidates=' . count($reap['candidates'])
            . ' signalled=' . count($reap['killed']);
        foreach ($reap['candidates'] as $candidate) {
            $lines[] = '  pid ' . $candidate['pid'] . ' (ppid ' . $candidate['ppid'] . ', age ' . $candidate['age'] . 's) '
                . $candidate['reason'] . ' :: ' . substr($candidate['cmdline'], 0, 160);
        }
        foreach ($reap['notes'] as $note) {
            $lines[] = '  note: ' . $note;
        }
        return implode("\n", $lines);
    };

    // Single choke point for starting an apply-prebuilt run, used by all
    // three trigger paths (/apply-prebuilt, /apply-prebuilt-force,
    // pm2-ensure-running's escalation) so "is one already running" can never
    // again be answered by two different, easily-desynced mechanisms.
    // Holds an flock() across the entire check -> (maybe kill) -> spawn
    // sequence, not just the check, so two requests landing at the same
    // instant can't both see "nothing running" and both spawn — the second
    // one blocks on flock() until the first has recorded its new PID.
    // Returns null when a run was spawned, or the PID of the run that blocked
    // it. $force=false: refuse if a run is genuinely still alive. $force=true:
    // kill the still-alive run first and proceed — but only if the kill can be
    // *verified*; if it could not (the account is out of process slots, so
    // exec() is a silent no-op) force refuses too and returns that PID. So
    // "force" means "make sure exactly one instance ends up running", never
    // "spawn regardless".
    //
    // Returns -1 (TRIGGER_GATE_REFUSED) when the nproc gate is closed: the
    // account already has too many processes for another apply run to be
    // anything but more load. That is a different answer from "one is already
    // running" (a positive pid), so callers can report it honestly instead of
    // blaming a run that does not exist.
    //
    // $outcome receives the gate reading and, on a successful spawn, whether the
    // new run's pid actually became visible. #97's lesson is that a recovery
    // path whose failure is invisible is a recovery path nobody can trust.
    $triggerPrebuiltRun = static function (bool $force, string $cmd, ?array &$outcome = null) use (
        $prebuiltLockFile,
        $isPrebuiltRunning,
        $killPrebuiltRun,
        $processGate
    ): ?int {
        // Re-read rather than reuse the memoised value: this is the last check
        // before the most expensive spawn in the file, and the caller may have
        // spent slots (jlist, pm2 kill, resurrect) since it last looked.
        $gate = $processGate(true);
        $outcome = [
            'gate' => $gate,
            'spawned' => false,
            'observed_pid' => 0,
            'wait_ms' => 0,
            'locked' => true,
            // Set only when $force had to kill a live run. Carries the state
            // $killPrebuiltRun last observed, so the caller's refusal message
            // can name it — #97's reconstruction cost two days and a support
            // ticket because this string did not exist.
            'kill_state' => null,
        ];

        if ($gate['blocking']) {
            return -1;
        }

        $fh = fopen($prebuiltLockFile, 'c');
        if ($fh === false) {
            // Can't lock — fail open (spawn anyway) rather than block all
            // deploys forever over a filesystem hiccup.
            $outcome['locked'] = false;
            @exec($cmd);
            $outcome['spawned'] = true;
            return null;
        }
        try {
            flock($fh, LOCK_EX);
            $runningPid = $isPrebuiltRunning();
            if ($runningPid !== 0) {
                if (!$force) {
                    return $runningPid;
                }
                $killState = null;
                $killed = $killPrebuiltRun($runningPid, $killState);
                $outcome['kill_state'] = $killState;
                if (!$killed) {
                    // The wrapper is genuinely still executing — verified
                    // against /proc/<pid>/stat's state character, so a zombie
                    // is no longer mistaken for it. Refuse rather than add
                    // another wrapper to a process table that is already full.
                    // The caller reports this the same way it reports an
                    // ordinary "one is already running", which is the honest
                    // answer: one still is.
                    return $runningPid;
                }
            }
            @exec($cmd);
            $outcome['spawned'] = true;

            // Hold the lock until the new run's pid is OBSERVABLE, not merely
            // until exec() returned.
            //
            // Two apply-prebuilt shells started in the same minute on
            // 2026-08-31 (pids 639961 and 639986) despite this flock() already
            // spanning check -> kill -> spawn. The lock was held over the wrong
            // interval: exec() returns the instant `nohup ... &` backgrounds the
            // script, so the lock released while the script had not yet run its
            // first statement — the one that writes .apply-prebuilt.pid. A
            // second request landing in that window took the lock, saw no pid,
            // concluded nothing was running and spawned a second run.
            //
            // Polling here closes that window: the next holder of the lock
            // cannot observe the gap, because the gap is inside our critical
            // section now. The 5s budget covers `/bin/sh -lc` sourcing the login
            // profile on a loaded host; a run that has not recorded a pid by
            // then almost certainly never started (exec() could not fork), which
            // is reported rather than assumed away.
            $waitedMs = 0;
            $observed = 0;
            while ($waitedMs < 5000) {
                usleep(100000);
                $waitedMs += 100;
                $observed = $isPrebuiltRunning();
                if ($observed !== 0) {
                    break;
                }
            }
            $outcome['observed_pid'] = $observed;
            $outcome['wait_ms'] = $waitedMs;
            return null;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    };

    $buildPrebuiltCommand = static function (bool $force) use ($appDir, $nodeBin, $pm2Bin, $ntfyUrl): string {
        $startMarker = $force ? '[START-FORCE-V4]' : '[START-V4]';
        $doneMarker = $force ? '[DONE-FORCE-V4]' : '[DONE-V4]';
        $failMarker = $force ? '[FAIL-FORCE-V4]' : '[FAIL-V4]';
        // 2026-08-16: apply-prebuilt-force used to fail identically every 5
        // minutes (the pm2-ensure-running cron) with nobody told — a stuck
        // .next3_stage left it silently failing for hours until a human
        // happened to check the site. .apply-prebuilt-fail-count persists
        // across runs (reset to 0 on success, incremented on failure); once
        // it's a multiple of this threshold we push an ntfy.sh alert instead
        // of just logging. 3 fails * the 5-min cron interval = ~15 min
        // before the first alert — long enough to skip a single transient
        // blip, short enough that "found out via a human visiting the site"
        // should never happen again.
        $failAlertThreshold = 3;

        // Health-probe budget, scaled by the consecutive-failure count already
        // on record — SPEC-HEALTH-20260831-RECOVERY-LOAD §2.3.
        //
        // The probe was a flat 150 attempts, each attempt two `curl` forks
        // against 127.0.0.1:3000. When the app comes up that costs a couple of
        // seconds and nobody notices. When the app CANNOT come up it is 300
        // curl forks (plus 150 `sleep` forks — sleep is /bin/sleep, not a shell
        // builtin in /bin/sh) hammering a port that is refusing connections,
        // for up to ~25 minutes. The pm2-ensure-running watchdog escalates
        // every 5 minutes, so several of these overlap, and the account this is
        // running on is one whose presenting symptom is that it cannot fork.
        // The recovery mechanism becomes the load.
        //
        // .apply-prebuilt-fail-count already persists across runs (reset to 0
        // on success, incremented on failure) and was read only to decide
        // whether to send an ntfy alert. It is exactly the signal needed here:
        // it distinguishes "first try after a healthy period, give it
        // everything" from "the fourth consecutive attempt at something that
        // has not worked once".
        //
        //   prior consecutive failures -> attempts -> curl forks -> worst case
        //     0   150   300   full budget, unchanged: a cold start after a
        //                     healthy period gets exactly what it gets today
        //     1   100   200
        //     2    60   120   60 was this probe's own budget before 2026-08-02,
        //                     and it carried real cold starts for months
        //     3+   30    60   evidence at this point says the app is not
        //                     starting; each further attempt is pure load
        //
        // The floor is 30 rather than something smaller because a genuine cold
        // start under host load has been observed to need tens of seconds
        // (which is why the budget was raised 60 -> 150 on 2026-08-02), and
        // aborting a deploy that WOULD have succeeded triggers the rollback
        // path. 30 attempts still exceeds a normal cold start several times
        // over. This trades an 80% cut in the failing case against no change at
        // all in the healthy case — deliberately, because the healthy case is
        // the one where being wrong costs a working deploy.
        $probeMaxFresh = 150; // 0 prior consecutive failures
        $probeMaxAfter1 = 100;
        $probeMaxAfter2 = 60;
        $probeMaxAfter3 = 30; // 3 or more

        $script = "cd {$appDir} "
            . "&& SWAPPED=0; "
            . "{ "
            // Recorded first, before anything else, so triggerPrebuiltRun()'s
            // /proc/<pid> liveness check is accurate from the instant this
            // process exists — this file (not .apply-prebuilt.lock's mtime)
            // is now the sole source of truth for "is a run still alive".
            . "echo \$\$ > .apply-prebuilt.pid; "
            . "echo '{$startMarker} '$(date) > .apply-prebuilt.log; "
            . "echo '[PWD] '$(pwd) >> .apply-prebuilt.log; "
            // Probe budget, decided here — before anything can abort — so it is
            // always in the log even when an earlier stage fails. Read once;
            // the success path below reuses $PREV_FAILS rather than cat-ing the
            // file a second time. The case guard turns a truncated or garbage
            // fail-count file into 0 (the generous budget) instead of letting
            // `[ "$PREV_FAILS" -ge 3 ]` abort on a syntax error — failing OPEN,
            // the same rule the nproc gate follows.
            . "PREV_FAILS=$(cat .apply-prebuilt-fail-count 2>/dev/null || echo 0); "
            . "case \"\$PREV_FAILS\" in ''|*[!0-9]*) PREV_FAILS=0 ;; esac; "
            . "if [ \"\$PREV_FAILS\" -ge 3 ]; then PROBE_MAX={$probeMaxAfter3}; "
            . "elif [ \"\$PREV_FAILS\" -ge 2 ]; then PROBE_MAX={$probeMaxAfter2}; "
            . "elif [ \"\$PREV_FAILS\" -ge 1 ]; then PROBE_MAX={$probeMaxAfter1}; "
            . "else PROBE_MAX={$probeMaxFresh}; fi; "
            . "echo \"[PROBE-BUDGET] prev_consecutive_fails=\$PREV_FAILS attempts=\$PROBE_MAX\" >> .apply-prebuilt.log; "
            // Stage dir is unique per run (own PID suffix), and cleanup of
            // *previous* runs' leftovers is best-effort / non-blocking —
            // deliberately NOT part of the && chain. 2026-08-16: a
            // CloudLinux resource-throttle kill interrupted an `rm -rf
            // .next3_stage` mid-flight, leaving every file "Permission
            // denied" to a plain rm. Back when this used one fixed-name
            // directory, that single stuck leftover made every subsequent
            // 5-minute self-heal tick fail on the exact same `rm -rf` —
            // forever, silently, with nobody notified — until a human
            // eventually noticed the site was down and a hosting-support
            // ticket got it manually deleted. A stuck leftover now just sits
            // there inert; it can never block a new run from proceeding.
            . "STAGE_DIR=.next3_stage.\$\$; "
            . "{ chmod -R u+rwX .next3_stage* .next3_failed; rm -rf .next3_stage* .next3_failed; } >> .apply-prebuilt.log 2>&1; "
            . "mkdir -p \$STAGE_DIR >> .apply-prebuilt.log 2>&1 "
            . "&& tar --no-same-owner --no-same-permissions --delay-directory-restore --warning=no-unknown-keyword -xzf .prebuilt-next3.tgz -C \$STAGE_DIR >> .apply-prebuilt.log 2>&1 "
            . "&& test -s \$STAGE_DIR/.next3/BUILD_ID "
            . "&& test -d \$STAGE_DIR/.next3/server "
            . "&& test -d \$STAGE_DIR/.next3/static/chunks "
            . "&& test -s \$STAGE_DIR/.next3/routes-manifest.json "
            . "&& find \$STAGE_DIR/.next3/static/chunks -type f -name '*.js' -print -quit | grep -q . "
            . "&& chmod -R u+rwX \$STAGE_DIR/.next3 >> .apply-prebuilt.log 2>&1 "
            . "&& mkdir -p public/images/news/pixabay >> .apply-prebuilt.log 2>&1 "
            . "&& chmod u+rwx public/images/news/pixabay >> .apply-prebuilt.log 2>&1 "
            // Best-effort, deliberately NOT part of the required && chain (unlike
            // the pixabay step above): confirmed live 2026-08-18 that this host's
            // public/images/news/ directory permissions let this process no-op
            // "mkdir -p" an already-existing subdir (pixabay) but refuse to create
            // a genuinely new one ("Permission denied") — so a hard requirement
            // here would abort every deploy until a human fixes host permissions
            // out-of-band. The `|| true` swallows that failure; if it does fail,
            // Pexels/Unsplash images simply won't have anywhere to land until the
            // in-app Node process (a different user context — see
            // lib/server/pexels/download.ts, lib/server/unsplash/download.ts,
            // both of which already do their own `mkdir(..., { recursive: true })`
            // before writing) creates these directories itself on first use.
            // All five runtime-written image directories, not just two. Only pexels
            // and unsplash were listed here, so `articles` kept whatever ownership it
            // was first created with and the Node process could not write into it —
            // every OG image backfill failed with EACCES for months while reporting
            // the useless string "download failed validation".
            //
            // An explicit mode, not u+rwx. The `ls -ld` logged below confirmed both
            // this script and the Node app run as the same uid (tw123457) — the
            // comment above claiming "a different user context" is wrong — and that
            // articles/ had simply lost its owner write bit. 0755 restores it and
            // states the intended mode outright instead of adding bits to whatever
            // the directory happened to have.
            . "&& { mkdir -p public/images/news/articles public/images/news/maps public/images/news/pixabay public/images/news/pexels public/images/news/unsplash "
            . "&& chmod 0755 public/images/news/articles public/images/news/maps public/images/news/pixabay public/images/news/pexels public/images/news/unsplash || true; } >> .apply-prebuilt.log 2>&1 "
            // Record who actually owns these afterwards. chmod only succeeds for the
            // owner, so if the EACCES persists this line is what tells us whether the
            // chmod was refused and a manual chown is required.
            . "&& { echo \"--- runtime image dir ownership ---\"; id; ls -ld public/images/news/*/ ; } >> .apply-prebuilt.log 2>&1 || true "
            // Best-effort: extracts INTO the existing public/ dir (no wipe first), so
            // runtime-generated subdirs like images/news/pixabay, images/news/pexels,
            // images/news/unsplash, and images/news/articles are left untouched — only
            // files actually present in the uploaded tarball get added/overwritten. A
            // missing or bad tarball shouldn't fail the deploy.
            . "&& { if [ -s .prebuilt-public.tgz ]; then tar --no-same-owner --no-same-permissions -xzf .prebuilt-public.tgz -C public >> .apply-prebuilt.log 2>&1 && rm -f .prebuilt-public.tgz; fi; } "
            . "&& test -s .env "
            . "&& { if [ -s .pixabay.env ]; then "
            . "cp .env .env.before-pixabay "
            . "&& awk -F= '{print \"^\" \$1 \"=\"}' .pixabay.env > .pixabay.env.keys "
            . "&& grep -vf .pixabay.env.keys .env > .env.pixabay-next "
            . "&& rm -f .pixabay.env.keys "
            . "&& cat .pixabay.env >> .env.pixabay-next "
            . "&& chmod 600 .env.pixabay-next "
            . "&& mv .env.pixabay-next .env "
            . "&& rm -f .pixabay.env; "
            . "fi; } "
            . "&& rm -rf .next3_previous >> .apply-prebuilt.log 2>&1 "
            . "&& { if [ -d .next3 ]; then mv .next3 .next3_previous; fi; } "
            . "&& mv \$STAGE_DIR/.next3 .next3 >> .apply-prebuilt.log 2>&1 "
            . "&& rmdir \$STAGE_DIR >> .apply-prebuilt.log 2>&1 "
            . "&& SWAPPED=1 "
            . "&& echo '[BUILD_ID] '$(cat .next3/BUILD_ID) >> .apply-prebuilt.log "
            . "&& ({$pm2Bin} delete health-web >> .apply-prebuilt.log 2>&1 || true) "
            . "&& setsid {$pm2Bin} start ecosystem.config.cjs --only health-web >> .apply-prebuilt.log 2>&1 "
            // Was 60 attempts (~60s worst case, raised from an original 30) —
            // still failed 3 real cold starts in a row on 2026-08-02 (the
            // GH Actions side that polls this same restart was separately
            // bumped 30->150 attempts the same day). Raising this one too so
            // both sides share the same generous budget instead of the
            // client giving up before the thing it's waiting on could ever
            // finish.
            //
            // $PROBE_MAX, not a literal 150, since
            // SPEC-HEALTH-20260831-RECOVERY-LOAD: 150 for a first attempt after
            // a healthy period (unchanged), shrinking to 30 by the fourth
            // consecutive failure. See the $probeMax* table above for the full
            // schedule and its reasoning. Also logs what the probe actually
            // spent, so "the app never came up" and "we gave up too early" stop
            // being indistinguishable in the log.
            . "&& { PROBE_OK=0; for ATTEMPT in $(seq 1 \$PROBE_MAX); do if curl -fsS --max-time 10 http://127.0.0.1:3000/news >/dev/null 2>&1 && curl -fsS --max-time 10 http://127.0.0.1:3000/news/60 >/dev/null 2>&1; then PROBE_OK=1; break; fi; sleep 1; done; echo \"[PROBE] ok=\$PROBE_OK attempts_used=\$ATTEMPT budget=\$PROBE_MAX\" >> .apply-prebuilt.log; test \"\$PROBE_OK\" = 1; } "
            . "&& STATIC_FILE=$(find .next3/static/chunks -type f -name '*.js' -print -quit) "
            . "&& STATIC_REL=\${STATIC_FILE#.next3/static/} "
            . "&& curl -fsS --max-time 10 \"http://127.0.0.1:3000/_next/static/\$STATIC_REL\" | head -c 1 | grep -vq '<' "
            // $PREV_FAILS was already read at the top of this script to size the
            // probe budget, so this no longer re-cats the file — one fewer fork
            // on the path that exists because forks are scarce.
            . "&& { rm -f .apply-prebuilt-fail-count; "
            . (
                $ntfyUrl !== ''
                    ? "if [ \"\$PREV_FAILS\" -ge {$failAlertThreshold} ]; then curl -fsS --max-time 8 -H 'Title: health.j172.tw self-heal recovered' -d \"apply-prebuilt-force succeeded after \$PREV_FAILS consecutive failure(s)\" " . escapeshellarg($ntfyUrl) . " >/dev/null 2>&1 || true; fi; "
                    : ''
            )
            . "} "
            . "&& echo '{$doneMarker} '$(date) >> .apply-prebuilt.log; "
            . "} || { "
            . "echo '[ROLLBACK] apply or health probe failed' >> .apply-prebuilt.log; "
            . "if [ \"\$SWAPPED\" = 1 ] && [ -d .next3_previous ]; then rm -rf .next3_failed; mv .next3 .next3_failed; mv .next3_previous .next3; {$pm2Bin} restart health-web >> .apply-prebuilt.log 2>&1 || true; fi; "
            . "FAILS=$(( $(cat .apply-prebuilt-fail-count 2>/dev/null || echo 0) + 1 )); echo \"\$FAILS\" > .apply-prebuilt-fail-count; "
            . (
                $ntfyUrl !== ''
                    ? "if [ $((FAILS % {$failAlertThreshold})) -eq 0 ]; then curl -fsS --max-time 8 -H 'Title: health.j172.tw self-heal FAILING' -H 'Priority: urgent' -d \"apply-prebuilt-force has failed \$FAILS time(s) in a row. https://health.j172.tw/__ops/apply-prebuilt-status?key=...\" " . escapeshellarg($ntfyUrl) . " >/dev/null 2>&1 || true; fi; "
                    : ''
            )
            . "echo '{$failMarker} '$(date) >> .apply-prebuilt.log; "
            . "}; "
            . "rm -f .apply-prebuilt.pid";

        return "nohup /bin/sh -lc " . escapeshellarg($script) . " >/dev/null 2>&1 &";
    };

    if ($path === '/__ops/rebuild') {
        // A full `next build` is the single most expensive thing this file can
        // start. If the process table is already crowded it will not finish, it
        // will only take the last slots with it.
        $rebuildGate = $processGate();
        if ($rebuildGate['blocking']) {
            http_response_code(503);
            header('Content-Type: text/plain; charset=utf-8');
            echo "Rebuild REFUSED by the nproc gate.\n";
            echo $rebuildGate['note'] . "\n";
            exit;
        }

        if (is_file($buildLockFile) && (time() - (int) @filemtime($buildLockFile)) > 1800) {
            @unlink($buildLockFile);
        }

        if (is_file($buildLockFile)) {
            header('Content-Type: text/plain; charset=utf-8');
            echo "Rebuild already running.\n";
            if (is_file($logFile)) {
                echo file_get_contents($logFile);
            }
            exit;
        }

        @file_put_contents($buildLockFile, (string) time(), LOCK_EX);
        @file_put_contents($logFile, "[TRIGGER] " . date('c') . "\n", LOCK_EX);

        $cmd = "nohup /bin/sh -lc "
            . escapeshellarg(
                "cd {$appDir} "
                . "&& echo '[START] '$(date) > .rebuild-homepage.log "
                . "&& {$nodeBin} -v >> .rebuild-homepage.log 2>&1 "
                . "&& export PATH=" . dirname($nodeBin) . ":\$PATH "
                . "&& export NEXT_DISABLE_SWC_WASM=1 "
                . "&& export NEXT_DISABLE_SWC_WORKER=1 "
                . "&& export UV_THREADPOOL_SIZE=1 "
                . "&& export BROWSERSLIST_IGNORE_OLD_DATA=1 "
                . "&& {$nodeBin} ./node_modules/next/dist/bin/next build --webpack >> .rebuild-homepage.log 2>&1 "
                . "&& ({$pm2Bin} restart health-web >> .rebuild-homepage.log 2>&1 || {$pm2Bin} restart all >> .rebuild-homepage.log 2>&1) "
                . "&& echo '[DONE] '$(date) >> .rebuild-homepage.log "
                . "|| echo '[FAIL] '$(date) >> .rebuild-homepage.log "
                . "; rm -f .rebuild-homepage.lock"
            )
            . " >/dev/null 2>&1 &";
        @exec($cmd);

        header('Content-Type: text/plain; charset=utf-8');
        echo "Rebuild triggered. Check /__ops/rebuild-status?key=...\n";
        exit;
    }

    if ($path === '/__ops/rebuild-status') {
        header('Content-Type: text/plain; charset=utf-8');
        echo is_file($buildLockFile) ? "running\n" : "idle\n";
        if (is_file($buildLockFile)) {
            echo "lock_mtime=" . date('c', (int) @filemtime($buildLockFile)) . "\n";
        }
        if (is_file($logFile)) {
            echo file_get_contents($logFile);
        } else {
            echo "No log yet.\n";
        }
        exit;
    }

    if ($path === '/__ops/apply-prebuilt') {
        $artifact = $appDir . '/.prebuilt-next3.tgz';
        if (!is_file($artifact)) {
            header('Content-Type: text/plain; charset=utf-8');
            echo "Artifact missing: {$artifact}\n";
            exit;
        }

        header('Content-Type: text/plain; charset=utf-8');
        $applyOutcome = null;
        $alreadyRunningPid = $triggerPrebuiltRun(false, $buildPrebuiltCommand(false), $applyOutcome);
        if ($alreadyRunningPid === -1) {
            http_response_code(503);
            echo "Apply prebuilt REFUSED by the nproc gate.\n";
            echo $applyOutcome['gate']['note'] . "\n";
            echo "Nothing was spawned. Escalation resumes automatically once the count drops.\n";
            exit;
        }
        if ($alreadyRunningPid !== null) {
            echo "Apply already running (pid {$alreadyRunningPid}).\n";
            if (is_file($prebuiltLogFile)) {
                echo file_get_contents($prebuiltLogFile);
            }
            exit;
        }

        echo "Apply prebuilt triggered. Check /__ops/apply-prebuilt-status?key=...\n";
        echo $applyOutcome['observed_pid'] !== 0
            ? "New run pid {$applyOutcome['observed_pid']} observed after {$applyOutcome['wait_ms']}ms.\n"
            : "WARNING: no pid appeared in /proc within {$applyOutcome['wait_ms']}ms — exec() may not have been able to fork.\n";
        exit;
    }

    if ($path === '/__ops/apply-prebuilt-force') {
        $artifact = $appDir . '/.prebuilt-next3.tgz';
        if (!is_file($artifact)) {
            header('Content-Type: text/plain; charset=utf-8');
            echo "Artifact missing: {$artifact}\n";
            exit;
        }

        // Force mode: if a previous run is genuinely still alive (checked via
        // /proc inside triggerPrebuiltRun, not a bypassable mtime file), kill
        // it first rather than orphaning it — "force" means "make sure
        // exactly one instance ends up running", not "ignore whether one
        // already is" (the latter is what stacked concurrent runs and
        // exhausted the host on 2026-08-10).
        $forceOutcome = null;
        $refusedPid = $triggerPrebuiltRun(true, $buildPrebuiltCommand(true), $forceOutcome);

        header('Content-Type: text/plain; charset=utf-8');
        if ($refusedPid === -1) {
            // Gate refusal, not a still-running run. Said separately from the
            // message below so the deploy log never blames a phantom pid.
            http_response_code(503);
            echo "Apply prebuilt REFUSED by the nproc gate.\n";
            echo $forceOutcome['gate']['note'] . "\n";
            echo "Nothing was spawned. Free process slots (see /__ops/reap-stragglers?key=...&apply=1)\n";
            echo "or wait — the gate reopens by itself once the count drops below the ceiling.\n";
            exit;
        }
        if ($refusedPid !== null) {
            // force can now decline — see $killPrebuiltRun. Say so plainly:
            // the deploy workflow reads this body, and reporting a trigger
            // that did not happen is how a failed apply used to look green
            // all the way through.
            http_response_code(503);
            echo "Apply prebuilt REFUSED: pid {$refusedPid} is still running and could not be killed.\n";
            // State the evidence, not just the verdict. On 2026-08-31 this
            // message was printed about a pid that had in fact been killed
            // (#97), and establishing that took a hosting-support process list
            // captured hours later. The observed state is now in the body, so
            // the next incident is one line of reading.
            if (($forceOutcome['kill_state'] ?? null) !== null) {
                echo "Observed state of pid {$refusedPid} after SIGKILL + 1.5s of backoff: {$forceOutcome['kill_state']}\n";
                echo "(A state of Z, or a missing /proc entry, counts as DEAD and would NOT have refused.)\n";
            } else {
                echo "No kill was attempted — the run was not observed alive at the moment of the check.\n";
            }
            echo "Starting another run while the wrapper is genuinely still executing would stack two\n";
            echo "concurrent extract+restart runs on an account that is already short of process slots.\n";
            echo "Free process slots first (see /__ops/reap-stragglers?key=...&apply=1), or check\n";
            echo "/__ops/pm2-status?key=... for the current process count and gate state.\n";
            exit;
        }

        echo "Apply prebuilt force-triggered-v4. Check /__ops/apply-prebuilt-status?key=...\n";
        echo $forceOutcome['observed_pid'] !== 0
            ? "New run pid {$forceOutcome['observed_pid']} observed after {$forceOutcome['wait_ms']}ms.\n"
            : "WARNING: no pid appeared in /proc within {$forceOutcome['wait_ms']}ms — exec() may not have been able to fork.\n";
        exit;
    }

    if ($path === '/__ops/pm2-ensure-running') {
        header('Content-Type: text/plain; charset=utf-8');
        $now = date('Y-m-d H:i:s');
        $watchdogLog = $appDir . '/.pm2-watchdog.log';

        // `pm2 jlist` talks to the pm2 daemon over its socket; if the daemon
        // itself is dead (not just health-web), a plain shell_exec() call
        // can hang indefinitely waiting for a socket nothing is listening
        // on, silently timing out this whole PHP request before it ever
        // reaches the restart logic below. That's exactly what happened
        // during the 2026-08-01 outage: this watchdog fired reliably ~14
        // times over the prior 4 days for ordinary "app got killed" events,
        // then went completely silent once the pm2 daemon itself died.
        // `timeout 5` turns that hang into a fast, detectable failure
        // (exit 124) instead of a silent no-op.
        // Fast path first, and it spawns nothing.
        //
        // `pm2 jlist` is a full Node process. This endpoint runs from cron
        // every 5 minutes, and bid.j172.tw's handler does the same thing on
        // the same account, so the old unconditional jlist cost ~24 process
        // spawns an hour purely to be told everything was fine. On a 20
        // Entry Process account that is most of the budget; worse, when the
        // host is busy `timeout 5` kills the wrapper while the Node children
        // it already spawned survive as orphans. On 2026-08-23 the account
        // filled up with exactly those idle pm2 helpers and wedged so hard
        // that this watchdog could no longer spawn the process it needed to
        // fix things — a deadlock that took host-side intervention to break.
        //
        // fsockopen costs zero processes, so the healthy case — which is
        // almost every tick — now runs entirely inside PHP.
        //
        // This is a fast path, NOT a replacement for the pm2 check. Anything
        // other than a clean HTTP response falls through to the original
        // logic below, so a slow-but-healthy app costs exactly what it used
        // to and still cannot trigger a spurious restart: the jlist path will
        // see health-web online and take no action.
        //
        // Deliberate trade-off: while the app answers on :3000 this no longer
        // notices a dead pm2 daemon. That is the right call — a dead daemon
        // with a healthy app is not an outage, and the escalation below still
        // rebuilds the daemon the moment the app actually stops answering.
        $probe = @fsockopen('127.0.0.1', 3000, $probeErrno, $probeErrstr, 2);
        if ($probe !== false) {
            // A connect alone only proves something holds the port; ask for a
            // status line so a wedged listener still escalates.
            $servingHttp = false;
            @stream_set_timeout($probe, 5);
            if (@fwrite($probe, "HEAD / HTTP/1.0\r\nHost: health.j172.tw\r\nConnection: close\r\n\r\n")) {
                $statusLine = (string) @fgets($probe, 128);
                $servingHttp = (stripos($statusLine, 'HTTP/') === 0);
            }
            @fclose($probe);

            if ($servingHttp) {
                echo "[{$now}] health-web is online (socket probe, no process spawned). No action taken.\n";
                exit;
            }
        }

        // ------------------------------------------------------------------
        // Everything from here on spawns processes. This is the failure path,
        // which is exactly when process slots are scarcest — and, until #98, it
        // was unconditional: five pm2 spawns per escalation, every five minutes,
        // for as long as the app stayed down. Over the 4h39m outage of
        // 2026-08-31 that is ~56 escalations, and the daemons they left behind
        // held the slots the next escalation needed.
        //
        // So before spawning anything: survey what is already stuck, then read
        // the process count out of /proc and refuse to escalate if the table is
        // already crowded.
        //
        // OBSERVE-ONLY on this path, deliberately. The reaper signals processes
        // on a live host, it is new, and this repo has no PHP test setup — the
        // only automated check on this file is `php -l` in CI, which proves it
        // parses and nothing more. One of its rules can in principle reach an
        // unmanaged bid-web worker, i.e. the *other* site. So it runs here in
        // dry-run and writes what it *would* have killed to the watchdog log;
        // `/__ops/reap-stragglers?...&apply=1` remains available to act on that
        // evidence by hand.
        //
        // The precedent for this caution is #97: posix_kill was shipped as a
        // recovery path, silently fell back to exec(), and stayed a no-op for
        // two days because nothing reported whether it was working. Reading a
        // real incident's log before granting this kill authority is the cheap
        // version of that lesson. Flip to true once the logged decisions have
        // been checked against a real accumulation.
        // ------------------------------------------------------------------
        $reap = $reapStragglers(false);
        @file_put_contents($watchdogLog, "[{$now}] (observe-only) " . $reapSummary($reap) . "\n", FILE_APPEND);

        // Re-read after the survey. Nothing was freed — the reaper did not act —
        // so this is simply the current count.
        $gate = $processGate(true);
        @file_put_contents($watchdogLog, "[{$now}] nproc-gate: " . $gate['note'] . "\n", FILE_APPEND);

        if ($gate['blocking']) {
            // No jlist, no pm2 kill, no pkill, no resurrect, no apply-prebuilt.
            // Nothing below this point runs, so this tick costs zero spawns.
            //
            // Note what this is NOT: it is not "give up after N failures". The
            // next cron tick five minutes from now re-reads the count, and the
            // moment it is under the ceiling the full escalation runs again —
            // no counter to reset, no state to clear, nothing to un-latch.
            http_response_code(503);
            echo "[{$now}] health-web is not answering, but escalation is BLOCKED by the nproc gate.\n";
            echo $gate['note'] . "\n";
            echo "No process was spawned this tick. Escalation resumes automatically once the count drops.\n";
            echo $reapSummary($reap) . "\n";
            exit;
        }

        exec('timeout 5 ' . $pm2Bin . ' jlist 2>/dev/null', $jlistOutput, $jlistExit);
        $daemonResponsive = ($jlistExit === 0);

        if (!$daemonResponsive) {
            @file_put_contents(
                $watchdogLog,
                "[{$now}] pm2 jlist did not respond (exit={$jlistExit}) — pm2 daemon itself appears dead, rebuilding it before restarting app.\n",
                FILE_APPEND
            );

            // Best-effort graceful shutdown first (harmless if the daemon is
            // actually still alive and just slow), then forcibly clear its
            // runtime files so the next pm2 invocation is forced to spawn a
            // brand new daemon rather than talking to a half-dead one.
            exec('timeout 5 ' . $pm2Bin . ' kill 2>&1', $killOutput, $killExit);
            exec('pkill -9 -f "PM2 v" 2>&1', $pkillOutput, $pkillExit);
            @unlink('/home/tw123457/.pm2/pm2.pid');
            @unlink('/home/tw123457/.pm2/rpc.sock');
            @unlink('/home/tw123457/.pm2/pub.sock');

            // Spawns a fresh daemon and restores every process from the
            // last `pm2 save` — health-web and bid-web share this daemon on
            // this host, so this brings both back, not just this one.
            exec('timeout 20 ' . $pm2Bin . ' resurrect 2>&1', $resurrectOutput, $resurrectExit);
            @file_put_contents(
                $watchdogLog,
                "[{$now}] daemon rebuild: kill_exit={$killExit} resurrect_exit={$resurrectExit}\n" . implode("\n", $resurrectOutput) . "\n",
                FILE_APPEND
            );

            // Re-check with the now-hopefully-fresh daemon before deciding
            // whether health-web still needs the full apply-prebuilt restart.
            exec('timeout 5 ' . $pm2Bin . ' jlist 2>/dev/null', $jlistOutput, $jlistExit);
            $daemonResponsive = ($jlistExit === 0);
        }

        $isOnline = false;
        if ($daemonResponsive) {
            $procs = json_decode(implode("\n", $jlistOutput) ?: '[]', true);
            if (!is_array($procs)) {
                $procs = [];
            }
            foreach ($procs as $proc) {
                if (($proc['name'] ?? '') === 'health-web' && ($proc['pm2_env']['status'] ?? '') === 'online') {
                    $isOnline = true;
                    break;
                }
            }
        }

        if ($isOnline) {
            echo "[{$now}] health-web is online. No action taken.\n";
            exit;
        }

        // A restart triggered by this endpoint, apply-prebuilt-force, or a manual
        // apply-prebuilt can take well over a minute to health-probe (worst case
        // ~52 min if the probe curls hang instead of refusing outright, now
        // ~10 min once the fail-count has scaled the budget down to 30
        // attempts — see $probeMax* in $buildPrebuiltCommand) — still longer
        // than this endpoint's cron interval. Without this check, a cron
        // tick landing mid-restart would race a second concurrent extract+restart
        // against the one still running. triggerPrebuiltRun()'s /proc-based check
        // (shared with /apply-prebuilt and /apply-prebuilt-force) catches an
        // in-flight restart no matter which endpoint started it, so this no
        // longer needs its own bespoke log-scraping copy of that logic.
        @file_put_contents($watchdogLog, "[{$now}] health-web was not online (this host periodically kills long-running background processes) — restarting via apply-prebuilt.\n", FILE_APPEND);

        // Reuse the same tested apply-prebuilt path (re-extracts the last
        // deployed build, restarts pm2, health-probes, rolls back on
        // failure) rather than a bespoke "just pm2 start" — this host has
        // been silently killing the health-web process roughly once a day,
        // and this endpoint is meant to be hit by an external cron job so
        // it recovers without anyone noticing a 502 first. $force=false here
        // (refuse rather than kill-and-replace if one's still running) —
        // this path fires unattended every 5 minutes, so it should never be
        // the one deciding to kill a run that might just be taking a while
        // under host load; only a human-triggered apply-prebuilt-force does that.
        $watchdogOutcome = null;
        $alreadyRunningPid = $triggerPrebuiltRun(false, $buildPrebuiltCommand(true), $watchdogOutcome);
        if ($alreadyRunningPid === -1) {
            // The gate closed between the check above and here (the jlist /
            // resurrect calls we just made can themselves push the count over).
            http_response_code(503);
            @file_put_contents($watchdogLog, "[{$now}] apply-prebuilt not started: " . $watchdogOutcome['gate']['note'] . "\n", FILE_APPEND);
            echo "[{$now}] health-web was not online, but the restart was BLOCKED by the nproc gate.\n";
            echo $watchdogOutcome['gate']['note'] . "\n";
            exit;
        }
        if ($alreadyRunningPid !== null) {
            echo "[{$now}] health-web was not online, but a restart already appears to be in progress (pid {$alreadyRunningPid}) — not starting another.\n";
            if (is_file($prebuiltLogFile)) {
                echo file_get_contents($prebuiltLogFile);
            }
            exit;
        }

        if ($watchdogOutcome['observed_pid'] === 0) {
            // The spawn produced no observable pid within the wait. Say so in
            // the log rather than letting it look like a successful restart —
            // #97 spent two days looking at a fix that had silently no-opped.
            @file_put_contents(
                $watchdogLog,
                "[{$now}] apply-prebuilt spawned but NO pid appeared in /proc within {$watchdogOutcome['wait_ms']}ms — exec() may not have been able to fork.\n",
                FILE_APPEND
            );
        }

        echo "[{$now}] health-web was not online. Restart triggered — check /__ops/apply-prebuilt-status?key=...\n";
        echo $watchdogOutcome['observed_pid'] !== 0
            ? "New run pid {$watchdogOutcome['observed_pid']} observed after {$watchdogOutcome['wait_ms']}ms.\n"
            : "WARNING: no pid appeared in /proc within {$watchdogOutcome['wait_ms']}ms — exec() may not have been able to fork.\n";
        exit;
    }

    if ($path === '/__ops/reap-stragglers') {
        // Dry run by default: it prints exactly what it would signal and why,
        // and touches nothing. &apply=1 actually sends the signals. The watchdog
        // calls the applying form itself on the failure path; this endpoint is
        // for looking before an incident, and for reaping on demand during one.
        header('Content-Type: text/plain; charset=utf-8');
        $apply = (($_GET['apply'] ?? '') === '1');
        $reapGate = $processGate(true);
        echo "nproc-gate: " . $reapGate['note'] . "\n\n";
        echo $reapSummary($reapStragglers($apply)) . "\n";
        if (!$apply) {
            echo "\n(dry run — add &apply=1 to actually signal these)\n";
        }
        exit;
    }

    if ($path === '/__ops/pm2-status') {
        header('Content-Type: text/plain; charset=utf-8');

        // FORKLESS DIAGNOSTICS FIRST, deliberately.
        //
        // Every section below that calls shell_exec() needs a fork, and the
        // condition this endpoint is most often opened in is precisely the one
        // where forking fails. When that happens those sections come back empty
        // with no explanation — which is itself the documented fingerprint of
        // NPROC exhaustion, but only to someone who already knows to read it
        // that way. The numbers that actually diagnose the outage are these, and
        // they come from /proc and ini_get, so they print regardless.
        $gate = $processGate(true);
        echo "==== nproc gate (issue #98) ====\n";
        echo "process_count = " . ($gate['count'] === null ? 'UNAVAILABLE' : $gate['count']) . "\n";
        echo "ceiling       = {$gate['ceiling']}\n";
        echo "nproc_limit   = {$gate['limit']}\n";
        echo "blocking      = " . ($gate['blocking'] ? 'YES — escalation is being refused right now' : 'no') . "\n";
        echo $gate['note'] . "\n\n";

        // ---- the three facts #97 needed, and their answer ----
        // SETTLED 2026-08-31: all three came back true/true/'' — posix_kill was
        // callable the whole time and disable_functions is empty. Both earlier
        // hypotheses (missing ext-posix; posix_kill in disable_functions) are
        // dead. The signal was landing; the VERIFICATION was wrong, because
        // is_dir("/proc/<pid>") is true for a killed-but-unreaped zombie. See
        // $readProcState / $procIsDead.
        //
        // These lines stay because a fix whose availability cannot be observed
        // is a fix nobody can trust — the exec() fallback is still in the code
        // for hosts without ext-posix, and this is how you tell which branch
        // this host is on without guessing.
        echo "==== signal capability (issue #97) ====\n";
        echo "extension_loaded('posix')     = " . var_export(extension_loaded('posix'), true) . "\n";
        echo "function_exists('posix_kill') = " . var_export(function_exists('posix_kill'), true) . "\n";
        echo "ini_get('disable_functions')  = " . var_export(ini_get('disable_functions'), true) . "\n";
        echo "function_exists('exec')       = " . var_export(function_exists('exec'), true) . "\n";
        echo "function_exists('shell_exec') = " . var_export(function_exists('shell_exec'), true) . "\n";
        echo "kill mechanism in use         = " . (function_exists('posix_kill') ? 'posix_kill (forkless)' : 'exec kill -9 (needs a fork)') . "\n";
        // Proof the liveness test works on this host, printed from a pid that is
        // definitely alive: this very request. If the /proc/<pid>/stat parse
        // ever silently degrades, this line says so before an outage does.
        $selfPid = (int) getmypid();
        echo "liveness test                 = /proc/<pid>/stat state char, 'Z' counts as DEAD\n";
        echo "self-check (pid {$selfPid})" . str_repeat(' ', max(1, 18 - strlen((string) $selfPid))) . "= " . $describeProcState($selfPid)
            . ' -> ' . ($procIsDead($selfPid) ? 'DEAD (WRONG — the parse is broken)' : 'alive (correct)') . "\n";
        // And the pid the apply/force/watchdog paths actually gate on.
        $recordedPid = is_file($prebuiltPidFile) ? (int) trim((string) @file_get_contents($prebuiltPidFile)) : 0;
        echo "apply-prebuilt pid file       = " . ($recordedPid > 0 ? $recordedPid . ' -> ' . $describeProcState($recordedPid) : 'absent (no run recorded)') . "\n\n";

        echo "==== this account's processes (/proc, no fork) ====\n";
        if ($gate['count'] === null) {
            echo "unavailable — /proc unreadable or uid undetermined\n\n";
        } else {
            $listing = $gate['procs'];
            usort($listing, static fn(array $a, array $b): int => $b['age'] <=> $a['age']);
            echo str_pad('PID', 9) . str_pad('PPID', 9) . str_pad('AGE(s)', 10) . "CMDLINE\n";
            foreach ($listing as $proc) {
                echo str_pad((string) $proc['pid'], 9)
                    . str_pad((string) $proc['ppid'], 9)
                    . str_pad((string) $proc['age'], 10)
                    . substr($proc['cmdline'], 0, 140) . "\n";
            }
            echo "\n";
        }

        echo "==== straggler reap (dry run, no fork) ====\n";
        echo $reapSummary($reapStragglers(false)) . "\n\n";

        echo "==== /proc/net/tcp LISTEN ports (local, decoded) ====\n";
        $tcp = @file('/proc/net/tcp');
        if ($tcp) {
            foreach ($tcp as $i => $line) {
                if ($i === 0) continue;
                $cols = preg_split('/\s+/', trim($line));
                $localAddr = $cols[1] ?? '';
                $state = $cols[3] ?? '';
                if ($state !== '0A') continue;
                if (strpos($localAddr, ':') === false) continue;
                [$hexIp, $hexPort] = explode(':', $localAddr);
                $port = hexdec($hexPort);
                echo "port {$port} (state LISTEN)\n";
            }
        } else {
            echo "Could not read /proc/net/tcp\n";
        }
        echo "\n";

        echo "==== fsockopen 127.0.0.1:3000 from PHP ====\n";
        $fp = @fsockopen('127.0.0.1', 3000, $errno, $errstr, 3);
        echo $fp ? "connected\n" : "failed: {$errno} {$errstr}\n";
        if ($fp) fclose($fp);
        echo "\n";

        // Fork-heavy sections last, and skipped while the gate is closed: this
        // is a diagnostic page, and running six subprocesses on an account that
        // has none to spare would make the incident it is diagnosing worse.
        if ($gate['blocking'] && ($_GET['full'] ?? '') !== '1') {
            echo "==== shell diagnostics SKIPPED ====\n";
            echo "The nproc gate is blocking, and pm2 list / describe / curl / ss / netstat / ps\n";
            echo "each need a fork. Add &full=1 to run them anyway.\n";
            exit;
        }

        echo "==== pm2 list ====\n";
        echo shell_exec($pm2Bin . ' list 2>&1') . "\n";
        echo "==== pm2 describe health-web ====\n";
        echo shell_exec($pm2Bin . ' describe health-web 2>&1') . "\n";
        echo "==== curl -v http://127.0.0.1:3000/news ====\n";
        echo shell_exec('curl -v --max-time 8 http://127.0.0.1:3000/news 2>&1') . "\n";
        echo "==== ss -tlnp (port listeners) ====\n";
        echo shell_exec('ss -tlnp 2>&1') . "\n";
        echo shell_exec('netstat -tlnp 2>&1') . "\n";
        // `ps aux` is kept for the host-wide view, but the account's own process
        // table is already printed above from /proc, where it prints even when
        // this line cannot run.
        echo "==== node/next processes (ps) ====\n";
        echo shell_exec('ps aux 2>&1') . "\n";
        exit;
    }

    if ($path === '/__ops/pm2-logs') {
        header('Content-Type: text/plain; charset=utf-8');
        $lines = max(1, min(500, (int) ($_GET['lines'] ?? 200)));
        echo "==== pm2 logs health-web --lines {$lines} --nostream ====\n";
        echo shell_exec($pm2Bin . ' logs health-web --lines ' . $lines . ' --nostream 2>&1') . "\n";
        echo "==== raw log files under ~/.pm2/logs matching health-web* ====\n";
        echo shell_exec('ls -la /home/tw123457/.pm2/logs/ 2>&1 | grep health-web') . "\n";
        foreach (glob('/home/tw123457/.pm2/logs/health-web*') as $logPath) {
            echo "---- {$logPath} ----\n";
            echo shell_exec('tail -n ' . $lines . ' ' . escapeshellarg($logPath)) . "\n";
        }
        exit;
    }

    if ($path === '/__ops/apply-prebuilt-log') {
        header('Content-Type: text/plain; charset=utf-8');
        if (is_file($prebuiltLogFile)) {
            echo file_get_contents($prebuiltLogFile);
        } else {
            echo "No apply-prebuilt log yet.\n";
        }
        exit;
    }

    if ($path === '/__ops/db-fix') {
        header('Content-Type: text/plain; charset=utf-8');

        // This endpoint can print DB credentials and, with &setpass=1, reset the
        // MySQL user's password and grant it ALL PRIVILEGES — far more powerful
        // than the read-only /__ops/* endpoints that share $opsKey above, so it
        // requires a second, separately-held key on top of that check. Unset (the
        // default) means this endpoint always 403s — it's a break-glass tool for
        // manual incident recovery, not something that should stay reachable with
        // only the same key every other /__ops/* call uses.
        $dbFixKey = $readEnvVar('OPS_DB_FIX_KEY');
        if ($dbFixKey === '' || !hash_equals($dbFixKey, (string) ($_GET['dbFixKey'] ?? ''))) {
            http_response_code(403);
            echo 'Forbidden: missing or wrong dbFixKey';
            exit;
        }

        $envFile = $appDir . '/.env';
        $backupEnvFile = $appDir . '/.env.before-pixabay';

        if (($_GET['restorepass'] ?? '') === '1') {
            if (!is_file($envFile) || !is_file($backupEnvFile)) {
                echo "Cannot restore: .env or .env.before-pixabay missing\n";
                exit;
            }
            $current = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            $hasPassword = false;
            foreach ($current as $line) {
                if (str_starts_with($line, 'MYSQL_PASSWORD=')) {
                    $hasPassword = true;
                    break;
                }
            }
            if ($hasPassword) {
                echo "MYSQL_PASSWORD already present in .env, nothing to restore.\n";
                exit;
            }
            $backupPassword = null;
            foreach (file($backupEnvFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (str_starts_with($line, 'MYSQL_PASSWORD=')) {
                    $backupPassword = $line;
                    break;
                }
            }
            if ($backupPassword === null) {
                echo "MYSQL_PASSWORD not found in .env.before-pixabay either.\n";
                exit;
            }
            $current[] = $backupPassword;
            file_put_contents($envFile, implode("\n", $current) . "\n", LOCK_EX);
            echo "Restored MYSQL_PASSWORD into .env from .env.before-pixabay.\n";
            exit;
        }

        $envVars = [];
        if (is_file($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                if (preg_match('/^([A-Z_]+)=(.*)$/', $line, $m)) {
                    $envVars[$m[1]] = $m[2];
                }
            }
        } else {
            echo ".env not found at {$envFile}\n";
            exit;
        }

        $user = $envVars['MYSQL_USER'] ?? '';
        $pass = $envVars['MYSQL_PASSWORD'] ?? '';
        $db = $envVars['MYSQL_DATABASE'] ?? '';

        echo "==== .env values (password masked) ====\n";
        echo "MYSQL_HOST=" . ($envVars['MYSQL_HOST'] ?? '') . "\n";
        echo "MYSQL_USER={$user}\n";
        echo "MYSQL_DATABASE={$db}\n";
        echo "MYSQL_PASSWORD length=" . strlen($pass) . "\n";

        echo "==== loaded db extensions ====\n";
        echo "mysqli=" . (extension_loaded('mysqli') ? 'yes' : 'no') . "\n";
        echo "pdo_mysql=" . (extension_loaded('pdo_mysql') ? 'yes' : 'no') . "\n";

        $testConnect = static function (string $host) use ($user, $pass, $db): string {
            if (extension_loaded('pdo_mysql') && class_exists('PDO') && in_array('mysql', PDO::getAvailableDrivers(), true)) {
                try {
                    new PDO("mysql:host={$host};dbname={$db}", $user, $pass, [PDO::ATTR_TIMEOUT => 5]);
                    return "OK (pdo)\n";
                } catch (\Throwable $e) {
                    return "FAIL (pdo): " . $e->getMessage() . "\n";
                }
            }
            return "SKIP: pdo_mysql not available (use mysql cli test below instead)\n";
        };

        if (($_GET['testconn'] ?? '') === '1') {
            echo "==== db test host=localhost ====\n";
            echo $testConnect('localhost');

            echo "==== db test host=127.0.0.1 ====\n";
            echo $testConnect('127.0.0.1');
        } else {
            echo "==== db test skipped (pass &testconn=1 to run; mysqli caused a crash on this host) ====\n";
        }

        echo "==== mysql cli test host=localhost ====\n";
        $mysqlCliCmd = 'MYSQL_PWD=' . escapeshellarg($pass) . ' mysql -h localhost -u ' . escapeshellarg($user)
            . ' ' . escapeshellarg($db) . ' -e ' . escapeshellarg('SELECT 1') . ' 2>&1';
        echo shell_exec($mysqlCliCmd);

        echo "==== uapi Mysql list_users ====\n";
        echo shell_exec('uapi Mysql list_users 2>&1');

        echo "==== uapi Mysql list_databases ====\n";
        echo shell_exec('uapi Mysql list_databases 2>&1');

        if (($_GET['setpass'] ?? '') === '1' && $user !== '' && $pass !== '') {
            echo "==== uapi Mysql set_password (reset DB user password to match .env) ====\n";
            $cmd = 'uapi Mysql set_password user=' . escapeshellarg($user) . ' password=' . escapeshellarg($pass) . ' 2>&1';
            echo shell_exec($cmd);

            echo "==== uapi Mysql set_privileges_on_database (grant ALL on {$db} to {$user}) ====\n";
            $cmd2 = 'uapi Mysql set_privileges_on_database user=' . escapeshellarg($user)
                . ' database=' . escapeshellarg($db)
                . ' privileges=' . escapeshellarg('ALL PRIVILEGES') . ' 2>&1';
            echo shell_exec($cmd2);

            echo "==== db retest host=localhost after fix ====\n";
            echo $testConnect('localhost');
        }
        exit;
    }

    if ($path === '/__ops/apply-prebuilt-status') {
        header('Content-Type: text/plain; charset=utf-8');
        $livePid = $isPrebuiltRunning();
        echo $livePid !== 0 ? "running\n" : "idle\n";
        if ($livePid !== 0) {
            echo "pid={$livePid}\n";
        }
        if (is_file($prebuiltLogFile)) {
            echo file_get_contents($prebuiltLogFile);
        } else {
            echo "No log yet.\n";
        }
        exit;
    }

    if ($path === '/__ops/net-test') {
        header('Content-Type: text/plain; charset=utf-8');
        $testUrl = 'https://www.mohw.gov.tw/rss-16-1.html';

        echo "==== PHP curl to {$testUrl} ====\n";
        $ch = curl_init($testUrl);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_HEADER => false]);
        $body = curl_exec($ch);
        echo "http_code=" . curl_getinfo($ch, CURLINFO_HTTP_CODE) . " bytes=" . ($body === false ? "FAIL: " . curl_error($ch) : strlen($body)) . "\n";
        curl_close($ch);

        echo "\n==== node --version ====\n";
        echo shell_exec("{$nodeBin} --version 2>&1");

        echo "\n==== ulimit -a (current shell) ====\n";
        echo shell_exec('ulimit -a 2>&1');

        $script = "fetch(" . json_encode($testUrl) . ").then(async r => { console.log('status', r.status); const t = await r.text(); console.log('bytes', t.length); }).catch(e => { console.log('ERR', e && e.message); console.log('CAUSE', e && e.cause); });";
        $tmpFile = sys_get_temp_dir() . '/net-test-' . uniqid() . '.mjs';
        file_put_contents($tmpFile, $script);

        echo "\n==== raw node fetch() to {$testUrl} (default ulimit) ====\n";
        echo shell_exec("{$nodeBin} " . escapeshellarg($tmpFile) . " 2>&1");

        echo "\n==== ulimit -Hv (hard virtual memory limit) ====\n";
        echo shell_exec('ulimit -Hv 2>&1');

        echo "\n==== raw node fetch() with ulimit -v unlimited ====\n";
        echo shell_exec("bash -c 'ulimit -v unlimited 2>&1; ulimit -v; {$nodeBin} " . escapeshellarg($tmpFile) . "' 2>&1");

        echo "\n==== raw node fetch() with ulimit -v 4000000 ====\n";
        echo shell_exec("bash -c 'ulimit -v 4000000 2>&1; ulimit -v; {$nodeBin} " . escapeshellarg($tmpFile) . "' 2>&1");

        @unlink($tmpFile);

        exit;
    }
}

// Shared by /images/news/{pixabay,pexels,unsplash}/ and /images/news/articles/
// below — all serve a single flat asset directory the same way (resolve +
// traversal-check, 404 on miss, 415 on unrecognized extension, else serve
// with a long-lived cache header). Always exits, so behavior at each call
// site is unchanged.
$serveNewsAsset = static function (string $relative, string $root, array $types) use ($method): void {
    $rootReal = realpath($root);
    $fileReal = $relative === '' ? false : realpath($root . '/' . $relative);

    if ($rootReal === false || $fileReal === false || !is_file($fileReal) || !str_starts_with($fileReal, $rootReal . DIRECTORY_SEPARATOR)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo 'Image not found';
        exit;
    }

    $extension = strtolower(pathinfo($fileReal, PATHINFO_EXTENSION));
    if (!isset($types[$extension])) {
        http_response_code(415);
        exit;
    }

    header('Content-Type: ' . $types[$extension]);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . filesize($fileReal));
    if ($method !== 'HEAD') {
        readfile($fileReal);
    }
    exit;
};

if (str_starts_with($path, '/images/news/pixabay/')) {
    $serveNewsAsset(
        rawurldecode(substr($path, strlen('/images/news/pixabay/'))),
        '/home/tw123457/health_app/public/images/news/pixabay',
        ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'],
    );
}

if (str_starts_with($path, '/images/news/pexels/')) {
    $serveNewsAsset(
        rawurldecode(substr($path, strlen('/images/news/pexels/'))),
        '/home/tw123457/health_app/public/images/news/pexels',
        ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'],
    );
}

if (str_starts_with($path, '/images/news/unsplash/')) {
    $serveNewsAsset(
        rawurldecode(substr($path, strlen('/images/news/unsplash/'))),
        '/home/tw123457/health_app/public/images/news/unsplash',
        ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'],
    );
}

if (str_starts_with($path, '/images/news/articles/')) {
    $serveNewsAsset(
        rawurldecode(substr($path, strlen('/images/news/articles/'))),
        '/home/tw123457/health_app/public/images/news/articles',
        ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'],
    );
}

if (str_starts_with($path, '/_next/static/')) {
    $relative = rawurldecode(substr($path, strlen('/_next/static/')));
    if ($relative === '' || str_contains($relative, "\0") || str_contains($relative, '..')) {
        http_response_code(400);
        exit;
    }

    $staticRoots = [
        'current' => '/home/tw123457/health_app/.next3/static',
        'previous' => '/home/tw123457/health_app/.next3_previous/static',
    ];

    foreach ($staticRoots as $build => $root) {
        $rootReal = realpath($root);
        $fileReal = realpath($root . '/' . $relative);
        if ($rootReal === false || $fileReal === false || !is_file($fileReal) || !str_starts_with($fileReal, $rootReal . DIRECTORY_SEPARATOR)) {
            continue;
        }

        $types = [
            'css' => 'text/css; charset=utf-8',
            'js' => 'application/javascript; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'map' => 'application/json; charset=utf-8',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'wasm' => 'application/wasm',
        ];
        $extension = strtolower(pathinfo($fileReal, PATHINFO_EXTENSION));
        if (in_array($extension, ['woff', 'woff2', 'ttf', 'eot', 'otf', 'wasm'], true)) {
            @ini_set('zlib.output_compression', 'Off');
            if (function_exists('apache_setenv')) {
                @apache_setenv('no-gzip', '1');
            }
        }
        header('Content-Type: ' . ($types[$extension] ?? 'application/octet-stream'));
        header('Cache-Control: public, max-age=31536000, immutable');
        header('Content-Length: ' . filesize($fileReal));
        header('X-Next-Static-Build: ' . $build);
        if ($method !== 'HEAD') {
            readfile($fileReal);
        }
        exit;
    }

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'Static asset not found';
    exit;
}

if (str_starts_with($path, '/images/')) {
    $relative = rawurldecode(substr($path, strlen('/images/')));
    if ($relative !== '' && !str_contains($relative, "\0") && !str_contains($relative, '..')) {
        $publicReal = realpath('/home/tw123457/health_app/public/images');
        $fileReal = realpath('/home/tw123457/health_app/public/images/' . $relative);
        if ($fileReal !== false && $publicReal !== false && is_file($fileReal) && str_starts_with($fileReal, $publicReal . DIRECTORY_SEPARATOR)) {
            $ext = strtolower(pathinfo($fileReal, PATHINFO_EXTENSION));
            $mimeTypes = [
                'png' => 'image/png',
                'jpg' => 'image/jpeg',
                'jpeg' => 'image/jpeg',
                'gif' => 'image/gif',
                'webp' => 'image/webp',
                'svg' => 'image/svg+xml',
                'ico' => 'image/x-icon',
            ];
            header('Content-Type: ' . ($mimeTypes[$ext] ?? 'application/octet-stream'));
            header('Cache-Control: public, max-age=31536000, immutable');
            header('Access-Control-Allow-Origin: *');
            header('Content-Length: ' . filesize($fileReal));
            if ($method !== 'HEAD') {
                readfile($fileReal);
            }
            exit;
        }
    }
}

$target = 'http://127.0.0.1:3000' . $uri;

if ($path === '/favicon.ico' || $path === '/images/favicon.ico') {
    $favicon = '/home/tw123457/health_app/public/images/favicon.ico';
    if (is_file($favicon)) {
        header('Content-Type: image/x-icon');
        header('Cache-Control: public, max-age=86400');
        readfile($favicon);
        exit;
    }
}
$headers = [];
foreach ($_SERVER as $key => $value) {
    if (strpos($key, 'HTTP_') === 0) {
        $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
        if (!in_array(strtolower($name), ['connection', 'host', 'content-length'])) {
            $headers[] = $name . ': ' . $value;
        }
    }
}
$headers[] = 'Host: ' . ($_SERVER['HTTP_HOST'] ?? 'health.j172.tw');
$headers[] = 'X-Forwarded-Host: ' . ($_SERVER['HTTP_HOST'] ?? 'health.j172.tw');
$headers[] = 'X-Forwarded-Proto: https';
$headers[] = 'X-Forwarded-For: ' . ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
$body = file_get_contents('php://input');
$isLongRunningApi = str_starts_with($path, '/api/admin/') || str_starts_with($path, '/api/internal/');
$isSafeMethod = in_array($method, ['GET', 'HEAD'], true);
$allowSelfHealRetry = !$isLongRunningApi && $isSafeMethod;
$triggerPm2Watchdog = static function () use ($opsKey, $processGate): void {
    if ($opsKey === '') {
        return;
    }

    // Subject to the same nproc gate as the watchdog itself, and for a sharper
    // reason: this fires once per *failed visitor request*. During the 4h39m
    // outage, with bot traffic against a 502ing site, that is one curl spawned
    // per request on an account that had no slots left — the single largest
    // amplifier in this file. The 5-minute cron still calls the watchdog
    // endpoint directly, so nothing is lost by skipping the opportunistic
    // version while the process table is full.
    $gate = $processGate();
    if ($gate['blocking']) {
        return;
    }

    // Fire-and-forget: ask the existing watchdog endpoint to revive PM2/app
    // if needed, then let the current request retry once.
    $url = 'https://health.j172.tw/__ops/pm2-ensure-running?key=' . rawurlencode($opsKey) . '&cb=' . time();
    $cmd = 'nohup curl -k -fsS --max-time 8 --resolve health.j172.tw:443:103.21.221.12 '
        . escapeshellarg($url)
        . ' >/dev/null 2>&1 &';
    @exec($cmd);
};

$maxAttempts = $allowSelfHealRetry ? 2 : 1;
$response = false;
$lastCurlError = '';
$attempt = 0;

while ($attempt < $maxAttempts) {
    $attempt++;
    $ch = curl_init($target);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE']) ? $body : null,
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => $isLongRunningApi ? 280 : 30,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TCP_KEEPALIVE => 1,
        CURLOPT_TCP_KEEPIDLE => 30,
        CURLOPT_TCP_KEEPINTVL => 15,
    ]);

    $response = curl_exec($ch);
    if ($response !== false) {
        break;
    }

    $lastCurlError = curl_error($ch);
    curl_close($ch);

    if ($attempt < $maxAttempts) {
        $triggerPm2Watchdog();
        usleep(700000);
    }
}

if ($response === false) {
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Proxy error: ' . $lastCurlError;
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$headerText = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

curl_close($ch);
$is_error_document = isset($_SERVER['REDIRECT_STATUS']) && intval($_SERVER['REDIRECT_STATUS']) >= 400;
http_response_code($is_error_document ? 200 : ($status ?: 200));
if ($is_error_document) {
    header('Status: 200 OK');
}
header_remove();
$lines = preg_split('/
|
|
/', trim($headerText));
foreach ($lines as $i => $line) {
    if ($i === 0 || $line === '') continue;
    if (stripos($line, 'Transfer-Encoding:') === 0) continue;
    if (stripos($line, 'Content-Length:') === 0) continue;
    if (stripos($line, 'Content-Encoding:') === 0) continue;
    if (stripos($line, 'Connection:') === 0) continue;
    header($line, false);
}
if ($contentType) {
    header('Content-Type: ' . $contentType);
}
echo $body;
