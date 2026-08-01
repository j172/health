<?php
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($path, '/api/admin/') || str_starts_with($path, '/api/internal/')) {
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
if (str_starts_with($path, '/__ops/')) {
    // An empty $opsKey (e.g. OPS_KEY missing from .env) must never grant
    // access — otherwise an empty ?key= would satisfy '' !== '' === false.
    if ($opsKey === '' || ($_GET['key'] ?? '') !== $opsKey) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
        exit;
    }

    $appDir = '/home/tw123457/health_app';
    $logFile = $appDir . '/.rebuild-homepage.log';
    $buildLockFile = $appDir . '/.rebuild-homepage.lock';
    $prebuiltLogFile = $appDir . '/.apply-prebuilt.log';
    $prebuiltLockFile = $appDir . '/.apply-prebuilt.lock';
    $nodeBin = '/home/tw123457/.nvm/versions/node/v20.20.2/bin/node';
    $pm2Bin = $nodeBin . ' /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2';

    $buildPrebuiltCommand = static function (bool $force) use ($appDir, $nodeBin, $pm2Bin): string {
        $startMarker = $force ? '[START-FORCE-V4]' : '[START-V4]';
        $doneMarker = $force ? '[DONE-FORCE-V4]' : '[DONE-V4]';
        $failMarker = $force ? '[FAIL-FORCE-V4]' : '[FAIL-V4]';
        $script = "cd {$appDir} "
            . "&& SWAPPED=0; "
            . "{ "
            . "echo '{$startMarker} '$(date) > .apply-prebuilt.log; "
            . "echo '[PWD] '$(pwd) >> .apply-prebuilt.log; "
            . "rm -rf .next3_stage .next3_failed >> .apply-prebuilt.log 2>&1 "
            . "&& mkdir -p .next3_stage >> .apply-prebuilt.log 2>&1 "
            . "&& tar --no-same-owner --no-same-permissions --delay-directory-restore --warning=no-unknown-keyword -xzf .prebuilt-next3.tgz -C .next3_stage >> .apply-prebuilt.log 2>&1 "
            . "&& test -s .next3_stage/.next3/BUILD_ID "
            . "&& test -d .next3_stage/.next3/server "
            . "&& test -d .next3_stage/.next3/static/chunks "
            . "&& test -s .next3_stage/.next3/routes-manifest.json "
            . "&& find .next3_stage/.next3/static/chunks -type f -name '*.js' -print -quit | grep -q . "
            . "&& chmod -R u+rwX .next3_stage/.next3 >> .apply-prebuilt.log 2>&1 "
            . "&& mkdir -p public/images/news/pixabay >> .apply-prebuilt.log 2>&1 "
            . "&& chmod u+rwx public/images/news/pixabay >> .apply-prebuilt.log 2>&1 "
            // Best-effort: extracts INTO the existing public/ dir (no wipe first), so
            // runtime-generated subdirs like images/news/pixabay and images/news/articles
            // are left untouched — only files actually present in the uploaded tarball
            // get added/overwritten. A missing or bad tarball shouldn't fail the deploy.
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
            . "&& mv .next3_stage/.next3 .next3 >> .apply-prebuilt.log 2>&1 "
            . "&& rmdir .next3_stage >> .apply-prebuilt.log 2>&1 "
            . "&& SWAPPED=1 "
            . "&& echo '[BUILD_ID] '$(cat .next3/BUILD_ID) >> .apply-prebuilt.log "
            . "&& ({$pm2Bin} delete health-web >> .apply-prebuilt.log 2>&1 || true) "
            . "&& setsid {$pm2Bin} start ecosystem.config.cjs --only health-web >> .apply-prebuilt.log 2>&1 "
            . "&& { PROBE_OK=0; for ATTEMPT in $(seq 1 30); do if curl -fsS --max-time 10 http://127.0.0.1:3000/news >/dev/null 2>&1 && curl -fsS --max-time 10 http://127.0.0.1:3000/news/60 >/dev/null 2>&1; then PROBE_OK=1; break; fi; sleep 1; done; test \"\$PROBE_OK\" = 1; } "
            . "&& STATIC_FILE=$(find .next3/static/chunks -type f -name '*.js' -print -quit) "
            . "&& STATIC_REL=\${STATIC_FILE#.next3/static/} "
            . "&& curl -fsS --max-time 10 \"http://127.0.0.1:3000/_next/static/\$STATIC_REL\" | head -c 1 | grep -vq '<' "
            . "&& echo '{$doneMarker} '$(date) >> .apply-prebuilt.log; "
            . "} || { "
            . "echo '[ROLLBACK] apply or health probe failed' >> .apply-prebuilt.log; "
            . "if [ \"\$SWAPPED\" = 1 ] && [ -d .next3_previous ]; then rm -rf .next3_failed; mv .next3 .next3_failed; mv .next3_previous .next3; {$pm2Bin} restart health-web >> .apply-prebuilt.log 2>&1 || true; fi; "
            . "echo '{$failMarker} '$(date) >> .apply-prebuilt.log; "
            . "}; "
            . "rm -f .apply-prebuilt.lock";

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

        if (is_file($prebuiltLockFile) && (time() - (int) @filemtime($prebuiltLockFile)) > 1800) {
            @unlink($prebuiltLockFile);
        }

        if (is_file($prebuiltLockFile)) {
            header('Content-Type: text/plain; charset=utf-8');
            echo "Apply already running.\n";
            if (is_file($prebuiltLogFile)) {
                echo file_get_contents($prebuiltLogFile);
            }
            exit;
        }

        @file_put_contents($prebuiltLockFile, (string) time(), LOCK_EX);

        $cmd = $buildPrebuiltCommand(false);
        @exec($cmd);

        header('Content-Type: text/plain; charset=utf-8');
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

        // Force mode: ignore stale lock and rerun unpack + restart.
        @unlink($prebuiltLockFile);
        @unlink($prebuiltLogFile);

        $cmd = $buildPrebuiltCommand(true);
        @exec($cmd);

        header('Content-Type: text/plain; charset=utf-8');
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

        @file_put_contents($watchdogLog, "[{$now}] health-web was not online (this host periodically kills long-running background processes) — restarting via apply-prebuilt.\n", FILE_APPEND);

        // Reuse the same tested apply-prebuilt path (re-extracts the last
        // deployed build, restarts pm2, health-probes, rolls back on
        // failure) rather than a bespoke "just pm2 start" — this host has
        // been silently killing the health-web process roughly once a day,
        // and this endpoint is meant to be hit by an external cron job so
        // it recovers without anyone noticing a 502 first.
        @unlink($prebuiltLockFile);
        @unlink($prebuiltLogFile);
        $cmd = $buildPrebuiltCommand(true);
        @exec($cmd);

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
        echo is_file($prebuiltLockFile) ? "running\n" : "idle\n";
        if (is_file($prebuiltLockFile)) {
            echo "lock_mtime=" . date('c', (int) @filemtime($prebuiltLockFile)) . "\n";
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

if (str_starts_with($path, '/images/news/pixabay/')) {
    $relative = rawurldecode(substr($path, strlen('/images/news/pixabay/')));
    $root = '/home/tw123457/health_app/public/images/news/pixabay';
    $rootReal = realpath($root);
    $fileReal = $relative === '' ? false : realpath($root . '/' . $relative);

    if ($rootReal === false || $fileReal === false || !is_file($fileReal) || !str_starts_with($fileReal, $rootReal . DIRECTORY_SEPARATOR)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo 'Image not found';
        exit;
    }

    $types = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
    ];
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
}

if (str_starts_with($path, '/images/news/articles/')) {
    $relative = rawurldecode(substr($path, strlen('/images/news/articles/')));
    $root = '/home/tw123457/health_app/public/images/news/articles';
    $rootReal = realpath($root);
    $fileReal = $relative === '' ? false : realpath($root . '/' . $relative);

    if ($rootReal === false || $fileReal === false || !is_file($fileReal) || !str_starts_with($fileReal, $rootReal . DIRECTORY_SEPARATOR)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo 'Image not found';
        exit;
    }

    $types = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
    ];
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

$skipHourlySync = str_starts_with($path, '/_next/')
    || str_starts_with($path, '/images/')
    || str_starts_with($path, '/api/')
    || $path === '/favicon.ico'
    || $path === '/images/favicon.ico';

if (!$skipHourlySync) {
    $stateFile = '/home/tw123457/health_app/.rss-sync-last-run';
    $lockFile = '/home/tw123457/health_app/.rss-sync-trigger.lock';
    $lockHandle = @fopen($lockFile, 'c+');

    if ($lockHandle && @flock($lockHandle, LOCK_EX | LOCK_NB)) {
        $lastRun = is_file($stateFile) ? (int) trim((string) file_get_contents($stateFile)) : 0;
        if ($lastRun === 0 || (time() - $lastRun) >= 3600) {
            @file_put_contents($stateFile, (string) time(), LOCK_EX);
            $secret = $readEnvVar('RSS_SYNC_SECRET');
            if ($secret !== '') {
                $cmd = 'nohup curl -fsS -H ' . escapeshellarg('x-rss-sync-secret: ' . $secret) . ' http://127.0.0.1:3000/api/internal/rss-sync >/dev/null 2>&1 &';
                @exec($cmd);
            }
        }

        @flock($lockHandle, LOCK_UN);
    }

    if ($lockHandle) {
        fclose($lockHandle);
    }
}

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
]);
$response = curl_exec($ch);
if ($response === false) {
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Proxy error: ' . curl_error($ch);
    curl_close($ch);
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
