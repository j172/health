<?php
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

$opsKey = 'health-ops-20260725-rebuild';
if (str_starts_with($path, '/__ops/')) {
    if (($_GET['key'] ?? '') !== $opsKey) {
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
                . "&& /home/tw123457/.nvm/versions/node/v20.20.2/bin/node -v >> .rebuild-homepage.log 2>&1 "
                . "&& export PATH=/home/tw123457/.nvm/versions/node/v20.20.2/bin:\$PATH "
                . "&& export NEXT_DISABLE_SWC_WASM=1 "
                . "&& export NEXT_DISABLE_SWC_WORKER=1 "
                . "&& export UV_THREADPOOL_SIZE=1 "
                . "&& export BROWSERSLIST_IGNORE_OLD_DATA=1 "
                . "&& /home/tw123457/.nvm/versions/node/v20.20.2/bin/node ./node_modules/next/dist/bin/next build --webpack >> .rebuild-homepage.log 2>&1 "
                . "&& (/home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 restart health-web >> .rebuild-homepage.log 2>&1 || /home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 restart all >> .rebuild-homepage.log 2>&1) "
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

        $cmd = "nohup /bin/sh -lc "
            . escapeshellarg(
                "cd {$appDir} "
                . "&& { "
                . "echo '[START] '$(date) > .apply-prebuilt.log; "
                . "echo '[PWD] '$(pwd) >> .apply-prebuilt.log; "
                . "ls -ld . .next3 >> .apply-prebuilt.log 2>&1 || true; "
                . "chmod -R u+rwX .next3 >> .apply-prebuilt.log 2>&1 || true; "
                . "find .next3 -type d -exec chmod u+rwx {} \\; >> .apply-prebuilt.log 2>&1 || true; "
                . "rm -rf .next3 .next3_stage >> .apply-prebuilt.log 2>&1; "
                . "mkdir -p .next3_stage >> .apply-prebuilt.log 2>&1; "
                . "tar --no-same-owner --no-same-permissions --delay-directory-restore --warning=no-unknown-keyword -xzf .prebuilt-next3.tgz -C .next3_stage >> .apply-prebuilt.log 2>&1; "
                . "test -d .next3_stage/.next3 >> .apply-prebuilt.log 2>&1; "
                . "mv .next3_stage/.next3 .next3 >> .apply-prebuilt.log 2>&1; "
                . "rmdir .next3_stage >> .apply-prebuilt.log 2>&1 || true; "
                . "echo '[BUILD_ID] '$(cat .next3/BUILD_ID 2>/dev/null) >> .apply-prebuilt.log; "
                . "/home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 restart health-web >> .apply-prebuilt.log 2>&1; "
                . "echo '[DONE] '$(date) >> .apply-prebuilt.log; "
                . "} || { echo '[FAIL] '$(date) >> .apply-prebuilt.log; }; "
                . "rm -f .apply-prebuilt.lock"
            )
            . " >/dev/null 2>&1 &";
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

        $cmd = "nohup /bin/sh -lc "
            . escapeshellarg(
                "cd {$appDir} "
                . "&& { "
                . "echo '[START-FORCE-V3] '$(date) > .apply-prebuilt.log; "
                . "echo '[PWD] '$(pwd) >> .apply-prebuilt.log; "
                . "ls -ld . .next3 >> .apply-prebuilt.log 2>&1 || true; "
                . "chmod -R u+rwX .next3 >> .apply-prebuilt.log 2>&1 || true; "
                . "find .next3 -type d -exec chmod u+rwx {} \\; >> .apply-prebuilt.log 2>&1 || true; "
                . "rm -rf .next3 .next3_stage >> .apply-prebuilt.log 2>&1; "
                . "mkdir -p .next3_stage >> .apply-prebuilt.log 2>&1; "
                . "tar --no-same-owner --no-same-permissions --delay-directory-restore --warning=no-unknown-keyword -xzf .prebuilt-next3.tgz -C .next3_stage >> .apply-prebuilt.log 2>&1; "
                . "test -d .next3_stage/.next3 >> .apply-prebuilt.log 2>&1; "
                . "mv .next3_stage/.next3 .next3 >> .apply-prebuilt.log 2>&1; "
                . "rmdir .next3_stage >> .apply-prebuilt.log 2>&1 || true; "
                . "echo '[BUILD_ID] '$(cat .next3/BUILD_ID 2>/dev/null) >> .apply-prebuilt.log; "
                . "/home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 restart health-web >> .apply-prebuilt.log 2>&1; "
                . "echo '[DONE-FORCE-V3] '$(date) >> .apply-prebuilt.log; "
                . "} || { echo '[FAIL-FORCE-V3] '$(date) >> .apply-prebuilt.log; }; "
                . "rm -f .apply-prebuilt.lock"
            )
            . " >/dev/null 2>&1 &";
        @exec($cmd);

        header('Content-Type: text/plain; charset=utf-8');
        echo "Apply prebuilt force-triggered-v2. Check /__ops/apply-prebuilt-status?key=...\n";
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
            $secret = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET';
            $cmd = 'nohup curl -fsS -H ' . escapeshellarg('x-rss-sync-secret: ' . $secret) . ' http://127.0.0.1:3000/api/internal/rss-sync >/dev/null 2>&1 &';
            @exec($cmd);
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
$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_POSTFIELDS => in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE']) ? $body : null,
    CURLOPT_ENCODING => '',
    CURLOPT_TIMEOUT => 30,
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
