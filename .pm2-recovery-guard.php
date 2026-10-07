<?php
declare(strict_types=1);

final class Pm2RecoveryGuard
{
    public static function acquire(string $lockPath): mixed
    {
        $handle = @fopen($lockPath, 'c');
        if ($handle === false) {
            return null;
        }

        if (!flock($handle, LOCK_EX | LOCK_NB)) {
            fclose($handle);
            return null;
        }

        return $handle;
    }

    public static function release(mixed $handle): void
    {
        if (is_resource($handle)) {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    public static function retryDelaySeconds(int $consecutiveFailures): int
    {
        if ($consecutiveFailures <= 0) {
            return 0;
        }

        return min(3600, 300 * (2 ** min($consecutiveFailures - 1, 4)));
    }

    public static function isCoolingDown(int $lastAttemptAt, int $consecutiveFailures, int $now): bool
    {
        $delay = self::retryDelaySeconds($consecutiveFailures);
        return $delay > 0 && $lastAttemptAt > 0 && ($now - $lastAttemptAt) < $delay;
    }

    public static function countTasks(array $processes): ?int
    {
        $total = 0;
        foreach ($processes as $process) {
            if (!isset($process['threads']) || !is_int($process['threads']) || $process['threads'] < 1) {
                return null;
            }
            $total += $process['threads'];
        }

        return $total;
    }

    public static function isGateClosed(?int $taskCount, int $ceiling): bool
    {
        return $taskCount === null || $taskCount >= $ceiling;
    }

    public static function readTail(string $path, int $lineLimit): ?string
    {
        if ($lineLimit < 1) {
            return null;
        }

        $handle = @fopen($path, 'rb');
        if ($handle === false) {
            return null;
        }

        try {
            $stat = fstat($handle);
            $position = is_array($stat) && isset($stat['size']) ? (int) $stat['size'] : -1;
            if ($position < 0) {
                return null;
            }

            $buffer = '';
            while ($position > 0 && substr_count($buffer, "\n") <= $lineLimit) {
                $length = min(8192, $position);
                $position -= $length;
                if (fseek($handle, $position) !== 0) {
                    return null;
                }
                $chunk = fread($handle, $length);
                if (!is_string($chunk)) {
                    return null;
                }
                $buffer = $chunk . $buffer;
            }

            if ($position > 0) {
                $firstNewline = strpos($buffer, "\n");
                $buffer = $firstNewline === false ? '' : substr($buffer, $firstNewline + 1);
            }
            $buffer = rtrim($buffer, "\r\n");
            return $buffer === '' ? '' : implode("\n", array_slice(explode("\n", $buffer), -$lineLimit));
        } finally {
            fclose($handle);
        }
    }

    public static function readPositiveInteger(string $path): int
    {
        $raw = @file_get_contents($path);
        if (!is_string($raw) || !preg_match('/^\s*(\d+)\s*$/', $raw, $matches)) {
            return 0;
        }

        return min((int) $matches[1], 2_147_483_647);
    }

    public static function writeTimestamp(string $path, int $timestamp): bool
    {
        $value = (string) $timestamp;
        return @file_put_contents($path, $value, LOCK_EX) === strlen($value);
    }

    public static function clearFiles(string ...$paths): bool
    {
        $ok = true;
        foreach ($paths as $path) {
            if (is_file($path) && !@unlink($path)) {
                $ok = false;
            }
        }

        return $ok;
    }
}
