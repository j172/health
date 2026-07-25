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

    $buildPrebuiltCommand = static function (bool $force) use ($appDir): string {
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
            . "&& test -s .env "
            . "&& test -s .pixabay.env "
            . "&& cp .env .env.before-pixabay "
            . "&& grep -v '^PIXABAY_API_KEY=' .env > .env.pixabay-next "
            . "&& cat .pixabay.env >> .env.pixabay-next "
            . "&& chmod 600 .env.pixabay-next "
            . "&& mv .env.pixabay-next .env "
            . "&& rm -f .pixabay.env "
            . "&& rm -rf .next3_previous >> .apply-prebuilt.log 2>&1 "
            . "&& { if [ -d .next3 ]; then mv .next3 .next3_previous; fi; } "
            . "&& mv .next3_stage/.next3 .next3 >> .apply-prebuilt.log 2>&1 "
            . "&& rmdir .next3_stage >> .apply-prebuilt.log 2>&1 "
            . "&& SWAPPED=1 "
            . "&& echo '[BUILD_ID] '$(cat .next3/BUILD_ID) >> .apply-prebuilt.log "
            . "&& (/home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 restart health-web >> .apply-prebuilt.log 2>&1 || /home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 start ecosystem.config.cjs --only health-web >> .apply-prebuilt.log 2>&1) "
            . "&& { PROBE_OK=0; for ATTEMPT in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS --max-time 10 http://127.0.0.1:3000/news >/dev/null 2>&1 && curl -fsS --max-time 10 http://127.0.0.1:3000/news/60 >/dev/null 2>&1; then PROBE_OK=1; break; fi; sleep 1; done; test \"\$PROBE_OK\" = 1; } "
            . "&& STATIC_FILE=$(find .next3/static/chunks -type f -name '*.js' -print -quit) "
            . "&& STATIC_REL=\${STATIC_FILE#.next3/static/} "
            . "&& curl -fsS --max-time 10 \"http://127.0.0.1:3000/_next/static/\$STATIC_REL\" | head -c 1 | grep -vq '<' "
            . "&& echo '{$doneMarker} '$(date) >> .apply-prebuilt.log; "
            . "} || { "
            . "echo '[ROLLBACK] apply or health probe failed' >> .apply-prebuilt.log; "
            . "if [ \"\$SWAPPED\" = 1 ] && [ -d .next3_previous ]; then rm -rf .next3_failed; mv .next3 .next3_failed; mv .next3_previous .next3; (/home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 restart health-web >> .apply-prebuilt.log 2>&1 || /home/tw123457/.nvm/versions/node/v20.20.2/bin/node /home/tw123457/.nvm/versions/node/v20.20.2/lib/node_modules/pm2/bin/pm2 start ecosystem.config.cjs --only health-web >> .apply-prebuilt.log 2>&1) || true; fi; "
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
