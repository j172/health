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
    // a live process. /proc/<pid> existing is a sufficient liveness check on
    // Linux without depending on the posix/pcntl extensions (not assumed
    // enabled on this shared host, and not used anywhere else in this file).
    $isPrebuiltRunning = static function () use ($prebuiltPidFile): int {
        if (!is_file($prebuiltPidFile)) {
            return 0;
        }
        $pid = (int) trim((string) @file_get_contents($prebuiltPidFile));
        return ($pid > 0 && is_dir("/proc/{$pid}")) ? $pid : 0;
    };

    // Kills a still-running apply-prebuilt instance's direct children (tar,
    // curl, the `pm2 delete`/`pm2 start` invocations at the moment of kill)
    // then the wrapper shell itself. Deliberately does NOT touch pm2/node —
    // the "pm2 start" line inside the script runs under its own `setsid`
    // specifically so the app survives even when this wrapper gets killed;
    // only the wrapper and its transient helpers die.
    // Returns whether the wrapper is actually gone.
    //
    // Both kills go through exec(), and exec() cannot spawn anything once the
    // account is at its Entry Process ceiling — it fails silently and returns
    // nothing. That is not hypothetical: on 2026-08-23 it left two
    // [START-FORCE-V4] wrappers alive at once, because three stacked deploys
    // each "killed" the previous run without the kill ever running, then
    // spawned a replacement anyway. An unverified force is a process
    // amplifier at the exact moment the account can least afford one, so the
    // caller has to be told whether the kill landed instead of assuming it.
    $killPrebuiltRun = static function (int $pid): bool {
        @exec('pkill -9 -P ' . $pid . ' 2>&1');
        @exec('kill -9 ' . $pid . ' 2>&1');
        // SIGKILL is delivered synchronously but reaping is not — give the
        // kernel a moment before reading /proc/<pid>'s absence as proof.
        // (This also preserves the settle time the old call site had, so a
        // replacement still never races the dying wrapper for the same log
        // and pid files.)
        usleep(300000);
        return !is_dir("/proc/{$pid}");
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
    $triggerPrebuiltRun = static function (bool $force, string $cmd) use (
        $prebuiltLockFile,
        $isPrebuiltRunning,
        $killPrebuiltRun
    ): ?int {
        $fh = fopen($prebuiltLockFile, 'c');
        if ($fh === false) {
            // Can't lock — fail open (spawn anyway) rather than block all
            // deploys forever over a filesystem hiccup.
            @exec($cmd);
            return null;
        }
        try {
            flock($fh, LOCK_EX);
            $runningPid = $isPrebuiltRunning();
            if ($runningPid !== 0) {
                if (!$force) {
                    return $runningPid;
                }
                if (!$killPrebuiltRun($runningPid)) {
                    // Kill did not land — almost certainly because exec()
                    // itself could not spawn. Refuse rather than add another
                    // wrapper to a process table that is already full. The
                    // caller reports this the same way it reports an ordinary
                    // "one is already running", which is the honest answer:
                    // one still is.
                    return $runningPid;
                }
            }
            @exec($cmd);
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
            . "&& { PROBE_OK=0; for ATTEMPT in $(seq 1 150); do if curl -fsS --max-time 10 http://127.0.0.1:3000/news >/dev/null 2>&1 && curl -fsS --max-time 10 http://127.0.0.1:3000/news/60 >/dev/null 2>&1; then PROBE_OK=1; break; fi; sleep 1; done; test \"\$PROBE_OK\" = 1; } "
            . "&& STATIC_FILE=$(find .next3/static/chunks -type f -name '*.js' -print -quit) "
            . "&& STATIC_REL=\${STATIC_FILE#.next3/static/} "
            . "&& curl -fsS --max-time 10 \"http://127.0.0.1:3000/_next/static/\$STATIC_REL\" | head -c 1 | grep -vq '<' "
            . "&& { PREV_FAILS=$(cat .apply-prebuilt-fail-count 2>/dev/null || echo 0); rm -f .apply-prebuilt-fail-count; "
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
        $alreadyRunningPid = $triggerPrebuiltRun(false, $buildPrebuiltCommand(false));
        if ($alreadyRunningPid !== null) {
            echo "Apply already running (pid {$alreadyRunningPid}).\n";
            if (is_file($prebuiltLogFile)) {
                echo file_get_contents($prebuiltLogFile);
            }
            exit;
        }

        echo "Apply prebuilt triggered. Check /__ops/apply-prebuilt-status?key=...\n";
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
        $refusedPid = $triggerPrebuiltRun(true, $buildPrebuiltCommand(true));

        header('Content-Type: text/plain; charset=utf-8');
        if ($refusedPid !== null) {
            // force can now decline — see $killPrebuiltRun. Say so plainly:
            // the deploy workflow reads this body, and reporting a trigger
            // that did not happen is how a failed apply used to look green
            // all the way through.
            http_response_code(503);
            echo "Apply prebuilt REFUSED: pid {$refusedPid} is still running and could not be killed.\n";
            echo "The account is out of process slots (exec() cannot spawn), so starting another run\n";
            echo "would only deepen the problem. Free process slots first.\n";
            exit;
        }

        echo "Apply prebuilt force-triggered-v4. Check /__ops/apply-prebuilt-status?key=...\n";
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
        // ~20 min if the probe curls hang instead of refusing outright) — easily
        // longer than this endpoint's cron interval. Without this check, a cron
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
        $alreadyRunningPid = $triggerPrebuiltRun(false, $buildPrebuiltCommand(true));
        if ($alreadyRunningPid !== null) {
            echo "[{$now}] health-web was not online, but a restart already appears to be in progress (pid {$alreadyRunningPid}) — not starting another.\n";
            if (is_file($prebuiltLogFile)) {
                echo file_get_contents($prebuiltLogFile);
            }
            exit;
        }

        echo "[{$now}] health-web was not online. Restart triggered — check /__ops/apply-prebuilt-status?key=...\n";
        exit;
    }

    if ($path === '/__ops/pm2-status') {
        header('Content-Type: text/plain; charset=utf-8');
        echo "==== pm2 list ====\n";
        echo shell_exec($pm2Bin . ' list 2>&1') . "\n";
        echo "==== pm2 describe health-web ====\n";
        echo shell_exec($pm2Bin . ' describe health-web 2>&1') . "\n";
        echo "==== curl -v http://127.0.0.1:3000/news ====\n";
        echo shell_exec('curl -v --max-time 8 http://127.0.0.1:3000/news 2>&1') . "\n";
        echo "==== ss -tlnp (port listeners) ====\n";
        echo shell_exec('ss -tlnp 2>&1') . "\n";
        echo shell_exec('netstat -tlnp 2>&1') . "\n";
        echo "==== node/next processes (ps) ====\n";
        echo shell_exec('ps aux 2>&1') . "\n";
        echo "==== /proc/net/tcp LISTEN ports (local, decoded) ====\n";
        $tcp = @file('/proc/net/tcp');
        if ($tcp) {
            foreach ($tcp as $i => $line) {
                if ($i === 0) continue;
                $cols = preg_split('/\s+/', trim($line));
                $localAddr = $cols[1] ?? '';
                $state = $cols[3] ?? '';
                if ($state !== '0A') continue;
                [$hexIp, $hexPort] = explode(':', $localAddr);
                $port = hexdec($hexPort);
                echo "port {$port} (state LISTEN)\n";
            }
        } else {
            echo "Could not read /proc/net/tcp\n";
        }
        echo "==== fsockopen 127.0.0.1:3000 from PHP ====\n";
        $fp = @fsockopen('127.0.0.1', 3000, $errno, $errstr, 3);
        echo $fp ? "connected\n" : "failed: {$errno} {$errstr}\n";
        if ($fp) fclose($fp);
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
$triggerPm2Watchdog = static function () use ($opsKey): void {
    if ($opsKey === '') {
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
