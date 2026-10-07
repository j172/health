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
