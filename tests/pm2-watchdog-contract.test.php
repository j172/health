<?php
declare(strict_types=1);

function expectContract(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$frontController = file_get_contents(__DIR__ . '/../.remote-health-index.php');
if (!is_string($frontController)) {
    fwrite(STDERR, "FAIL: could not read the PM2 front controller\n");
    exit(1);
}

expectContract(str_contains($frontController, "'Threads:'"), 'the /proc scan reads per-process thread counts');
expectContract(
    str_contains($frontController, "header('Cache-Control: private, no-store, max-age=0')"),
    'authenticated maintenance responses cannot return cached stale diagnostics'
);
expectContract(
    str_contains($frontController, 'Pm2RecoveryGuard::countTasks($procs)')
        && str_contains($frontController, 'Pm2RecoveryGuard::isGateClosed($taskCount, $nprocEscalationCeiling)'),
    'the NPROC gate uses summed tasks and blocks unknown counts'
);
expectContract(str_contains($frontController, '$nprocEscalationCeiling = 65;'), 'the task threshold preserves a 35-task recovery budget');
expectContract(
    str_contains($frontController, "Pm2RecoveryGuard::acquire(\$pm2RecoveryLockFile)")
        && str_contains($frontController, '/usr/bin/flock -x'),
    'watchdog and shell PM2 operations share the recovery lock'
);
expectContract(
    str_contains($frontController, '.pm2-self-heal.lock')
        && str_contains($frontController, 'Pm2RecoveryGuard::isCoolingDown($lastAttemptAt, 1, time())'),
    'failed visitor requests cannot stampede the watchdog more than once per five minutes'
);
expectContract(
    str_contains($frontController, 'startOrRestart ecosystem.config.cjs --only health-web')
        && str_contains($frontController, 'startOrRestart ecosystem.config.cjs --only mall'),
    'the watchdog can independently restore both services'
);
expectContract(str_contains($frontController, 'return -2;') && str_contains($frontController, "'lock_error'"), 'an unavailable single-run lock refuses to spawn');

// #707: PM2 auto-restarts a SIGKILLed health-web within ~1s but Next needs
// another ~5-10s to listen on :3000. A single-shot probe in that gap used to
// escalate to apply-prebuilt, restarting the recovering process a second time.
// The watchdog must re-probe for a bounded grace window first, without
// weakening the lock, the nproc gate, the retry backoff or the escalation.
$ensureStart = strpos($frontController, "if (\$path === '/__ops/pm2-ensure-running')");
$ensureEnd = strpos($frontController, "if (\$path === '/__ops/reap-stragglers')", $ensureStart ?: 0);
expectContract(is_int($ensureStart) && is_int($ensureEnd), 'the pm2-ensure-running watchdog section is present');
$ensureSection = substr($frontController, $ensureStart, $ensureEnd - $ensureStart);
$ensureCode = implode("\n", array_filter(
    explode("\n", $ensureSection),
    static fn (string $line): bool => preg_match('/^\s*(\/\/|\*|\/\*)/', $line) !== 1
));

$graceStart = strpos($ensureCode, 'if (!$healthOnline) {');
expectContract(is_int($graceStart), 'the watchdog has a health-down grace re-probe branch');
$lockPos = strrpos(substr($ensureCode, 0, $graceStart), 'Pm2RecoveryGuard::acquire($pm2RecoveryLockFile)');
$gatePos = strrpos(substr($ensureCode, 0, $graceStart), "\$gate['blocking']");
$runningPos = strrpos(substr($ensureCode, 0, $graceStart), '$isPrebuiltRunning()');
$backoffPos = strrpos(substr($ensureCode, 0, $graceStart), 'Pm2RecoveryGuard::isCoolingDown($lastAttemptAt, $failureCount, time())');
$attemptStampPos = strpos($ensureCode, 'Pm2RecoveryGuard::writeTimestamp($pm2RecoveryLastAttemptFile, time())');
$escalatePos = strpos($ensureCode, '$triggerPrebuiltRun(false, $buildPrebuiltCommand(true), $watchdogOutcome)');
expectContract(
    $lockPos !== false && $gatePos !== false && $runningPos !== false && $backoffPos !== false,
    'the grace re-probe runs only after the shared lock, the nproc gate, the running-restart check and the retry backoff'
);
expectContract(
    is_int($attemptStampPos) && $graceStart < $attemptStampPos,
    'a tick rescued by the grace re-probe never records a recovery attempt'
);
expectContract(
    is_int($escalatePos) && $graceStart < $escalatePos,
    'the apply-prebuilt escalation still exists and only runs after the grace window'
);
expectContract(
    str_contains($ensureCode, "\$healthOnline = \$probeLocalHttp(3000, 'health.j172.tw');"),
    'the grace window reuses the existing local HTTP probe'
);

$graceCode = substr($ensureCode, $graceStart, $attemptStampPos - $graceStart);
expectContract(
    preg_match('/\$healthGraceSeconds\s*=\s*(\d+(?:\.\d+)?);/', $graceCode, $graceSeconds) === 1
        && (float) $graceSeconds[1] >= 20.0
        && (float) $graceSeconds[1] <= 30.0,
    'the grace window is about 25 seconds and never longer than a PHP worker should be held'
);
expectContract(
    preg_match('/\$healthGraceIntervalSeconds\s*=\s*(\d+(?:\.\d+)?);/', $graceCode, $graceInterval) === 1
        && (float) $graceInterval[1] >= 2.0
        && (float) $graceInterval[1] <= 3.0,
    'the grace window re-probes every two to three seconds'
);
expectContract(
    str_contains($graceCode, 'microtime(true)') && str_contains($graceCode, '$graceDeadline')
        && str_contains($graceCode, 'break;') && !str_contains($graceCode, 'while (true)'),
    'the grace loop is bounded by a wall-clock deadline'
);
expectContract(
    str_contains($graceCode, 'usleep(') && !str_contains($graceCode, 'exec(') && !str_contains($graceCode, 'shell_exec('),
    'the grace window waits without forking, so it cannot consume NPROC'
);
expectContract(
    str_contains($graceCode, 'ignore_user_abort(true)'),
    'a hung-up fire-and-forget caller cannot abort the grace window mid-decision'
);
expectContract(
    str_contains($graceCode, 'grace re-probe succeeded after')
        && str_contains($graceCode, 'NOT escalating to apply-prebuilt')
        && str_contains($graceCode, 'grace re-probe failed'),
    'the watchdog log records both grace outcomes'
);
$successLogPos = strpos($graceCode, 'grace re-probe succeeded after');
$successClearPos = strpos($graceCode, '$clearFailureStateIfIdle();');
$successExitPos = strpos($graceCode, 'exit;');
$failureLogPos = strpos($graceCode, 'grace re-probe failed');
expectContract(
    is_int($successLogPos) && is_int($successClearPos) && is_int($successExitPos) && is_int($failureLogPos)
        && $successLogPos < $successClearPos && $successClearPos < $successExitPos && $successExitPos < $failureLogPos,
    'a successful grace re-probe logs, clears the recovery state and stops the tick before the failure branch'
);
expectContract(
    !str_contains($graceCode, '$triggerPrebuiltRun') && !str_contains($graceCode, 'startOrRestart'),
    'the grace window itself never starts or restarts PM2'
);
expectContract(
    str_contains($frontController, 'health-web was not online (this host periodically kills long-running background processes) — restarting via apply-prebuilt.'),
    'a health-web that stays down past the grace window escalates exactly as before'
);

// The opportunistic watchdog is a background curl; its ceiling must outlast
// the grace window plus the escalation, or it would hang up mid-decision.
expectContract(
    preg_match('/nohup curl -k -fsS --max-time (\d+) --resolve health\.j172\.tw/', $frontController, $opportunisticCurl) === 1
        && (int) $opportunisticCurl[1] >= 45,
    'the visitor-triggered watchdog curl waits longer than the grace window'
);

$statusStart = strpos($frontController, "if (\$path === '/__ops/pm2-status')");
$statusEnd = strpos($frontController, "if (\$path === '/__ops/pm2-logs')", $statusStart ?: 0);
expectContract(is_int($statusStart) && is_int($statusEnd), 'the forkless PM2 status section is present');
$statusSection = substr($frontController, $statusStart, $statusEnd - $statusStart);
expectContract(!str_contains($statusSection, '$pm2Bin'), 'PM2 status does not invoke the PM2 CLI');
expectContract(!str_contains($statusSection, "\$_GET['full']"), 'fork-heavy status diagnostics cannot bypass the task gate');

$logsStart = strpos($frontController, "if (\$path === '/__ops/pm2-logs')");
$logsEnd = strpos($frontController, "if (\$path === '/__ops/apply-prebuilt-log')", $logsStart ?: 0);
expectContract(is_int($logsStart) && is_int($logsEnd), 'forkless PM2 log diagnostics are present');
expectContract(
    !str_contains(substr($frontController, $logsStart, $logsEnd - $logsStart), 'shell_exec'),
    'PM2 logs are read directly rather than spawning ls and tail'
);

echo "PASS: PM2 watchdog recovery integration contract\n";
