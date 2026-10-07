<?php
declare(strict_types=1);

require_once __DIR__ . '/../.pm2-recovery-guard.php';

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pm2-recovery-guard-' . bin2hex(random_bytes(8));
if (!mkdir($tempDir, 0700)) {
    fwrite(STDERR, "FAIL: could not create temporary test directory\n");
    exit(1);
}

$lockPath = $tempDir . DIRECTORY_SEPARATOR . 'recovery.lock';
$firstLock = Pm2RecoveryGuard::acquire($lockPath);
expect(is_resource($firstLock), 'first recovery request acquires the shared lock');
expect(Pm2RecoveryGuard::acquire($lockPath) === null, 'overlapping recovery request is rejected');
Pm2RecoveryGuard::release($firstLock);
$thirdLock = Pm2RecoveryGuard::acquire($lockPath);
expect(is_resource($thirdLock), 'a later recovery request acquires the released lock');
Pm2RecoveryGuard::release($thirdLock);

$expectedDelays = [0, 300, 600, 1200, 2400, 3600, 3600];
foreach ($expectedDelays as $failures => $expectedDelay) {
    expect(
        Pm2RecoveryGuard::retryDelaySeconds($failures) === $expectedDelay,
        "failure count {$failures} uses the expected retry delay"
    );
}

$now = 1_800_000_000;
expect(Pm2RecoveryGuard::isCoolingDown($now, 1, $now + 299), 'first failure is deferred before 5 minutes');
expect(!Pm2RecoveryGuard::isCoolingDown($now, 1, $now + 300), 'first failure retries at 5 minutes');
expect(Pm2RecoveryGuard::isCoolingDown($now, 4, $now + 2399), 'fourth failure is deferred before 40 minutes');
expect(!Pm2RecoveryGuard::isCoolingDown($now, 4, $now + 2400), 'fourth failure retries at 40 minutes');
expect(!Pm2RecoveryGuard::isCoolingDown(0, 4, $now), 'missing attempt timestamp never blocks recovery');
expect(
    Pm2RecoveryGuard::countTasks([
        ['threads' => 11],
        ['threads' => 11],
        ['threads' => 4],
    ]) === 26,
    'NPROC usage counts thread/task slots, not just process leaders'
);
expect(Pm2RecoveryGuard::countTasks([['threads' => 11], ['threads' => 0]]) === null, 'unreadable task counts are not treated as zero');
expect(Pm2RecoveryGuard::countTasks([['threads' => '11']]) === null, 'task counts must be parsed as integers');
expect(Pm2RecoveryGuard::isGateClosed(null, 65), 'an unknown task count blocks process-spawning recovery');
expect(Pm2RecoveryGuard::isGateClosed(65, 65), 'the threshold task count blocks recovery');
expect(!Pm2RecoveryGuard::isGateClosed(64, 65), 'recovery stays allowed below the task threshold');

$logPath = $tempDir . DIRECTORY_SEPARATOR . 'pm2-test.log';
expect(file_put_contents($logPath, "one\ntwo\nthree\nfour\n") !== false, 'test log fixture is written');
expect(Pm2RecoveryGuard::readTail($logPath, 2) === "three\nfour", 'forkless log tail returns exactly the requested final lines');
expect(file_put_contents($logPath, "one\ntwo\nthree") !== false, 'test log without trailing newline is written');
expect(Pm2RecoveryGuard::readTail($logPath, 2) === "two\nthree", 'forkless log tail handles files without a trailing newline');
expect(Pm2RecoveryGuard::readTail($logPath, 0) === null, 'invalid log tail length is rejected');
expect(Pm2RecoveryGuard::readTail($tempDir . DIRECTORY_SEPARATOR . 'missing.log', 2) === null, 'unreadable logs report failure');
expect(file_put_contents($logPath, str_repeat("entry\n", 2000) . "last one\nlast two\n") !== false, 'large test log fixture is written');
expect(Pm2RecoveryGuard::readTail($logPath, 2) === "last one\nlast two", 'forkless log tail reads backward across chunk boundaries');

unlink($logPath);
unlink($lockPath);
rmdir($tempDir);

echo "PASS: PM2 recovery guard, NPROC task gate, and forkless log tail\n";
