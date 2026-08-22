<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class LocalStateException extends \RuntimeException
{
}

final class SystemSynchronizationClock implements SynchronizationClock
{
    public function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }
}

final class NativeSynchronizationSleeper implements SynchronizationSleeper
{
    public function sleep(int $seconds): void
    {
        sleep($seconds);
    }
}

final class LocalProfileHealth
{
    public function __construct(
        public readonly string $profileKey,
        public readonly ?\DateTimeImmutable $lastAttemptAt,
        public readonly ?\DateTimeImmutable $lastSuccessfulSyncAt,
        public readonly ?string $syncResult,
        public readonly ?float $durationSeconds,
        public readonly ?int $itemCount,
        public readonly ?int $pageCount,
        public readonly bool $unchanged,
        public readonly ?string $activeRevision,
        public readonly ?string $activeEtag,
        public readonly ?string $failureCategory,
        public readonly bool $disabled,
        public readonly string $adapterVersion,
    ) {
    }
}

final class LocalProfileUsability
{
    public const NEVER_SYNCED = 'never_synced';
    public const DISABLED = 'disabled';
    public const USABLE = 'usable';
    public const STALE_USABLE = 'stale_usable';
    public const STALE_CUTOFF = 'stale_cutoff';
    public const UNAVAILABLE = 'unavailable';

    public function __construct(
        public readonly string $classification,
        public readonly ?int $staleAgeSeconds,
    ) {
    }
}

final class LocalProfileUsabilityResolver
{
    public function __construct(
        private readonly int $cadenceSeconds = 900,
        private readonly ?int $maximumStaleAgeSeconds = null,
    ) {
        if ($cadenceSeconds < 1 || $cadenceSeconds > 86_400 || ($maximumStaleAgeSeconds !== null && ($maximumStaleAgeSeconds < 1 || $maximumStaleAgeSeconds > 31_536_000))) {
            throw new \InvalidArgumentException('The local freshness configuration is invalid.');
        }
    }

    public function resolve(?LocalProfileState $state, \DateTimeImmutable $now): LocalProfileUsability
    {
        if ($state === null) {
            return new LocalProfileUsability(LocalProfileUsability::NEVER_SYNCED, null);
        }
        if ($state->disabled) {
            return new LocalProfileUsability(LocalProfileUsability::DISABLED, null);
        }
        if ($state->active === null || $state->lastSuccessfulSyncAt === null) {
            return new LocalProfileUsability(LocalProfileUsability::NEVER_SYNCED, null);
        }
        $age = (int) $now->format('U') - (int) $state->lastSuccessfulSyncAt->format('U');
        // A future local timestamp is bounded to fresh instead of producing a negative age.
        $age = max(0, $age);
        if ($this->maximumStaleAgeSeconds !== null && $age > $this->maximumStaleAgeSeconds) {
            return new LocalProfileUsability(LocalProfileUsability::STALE_CUTOFF, $age);
        }
        if ($age > $this->cadenceSeconds) {
            return new LocalProfileUsability(LocalProfileUsability::STALE_USABLE, $age);
        }
        return new LocalProfileUsability(LocalProfileUsability::USABLE, $age);
    }
}

final class LocalProfileRead
{
    public function __construct(
        public readonly ?ActiveProfileSnapshot $active,
        public readonly LocalProfileUsability $usability,
        public readonly LocalProfileHealth $health,
    ) {
    }
}

final class ProfileStatePaths
{
    private string $root;

    public function __construct(string $root)
    {
        if (!self::isAbsolute($root)) {
            throw new \InvalidArgumentException('The cache/state root must be an absolute path.');
        }
        $this->root = rtrim($root, DIRECTORY_SEPARATOR);
        if ($this->root === '') {
            throw new \InvalidArgumentException('The cache/state root is invalid.');
        }
    }

    public function root(): string
    {
        return $this->root;
    }

    public function profileDirectory(string $profileKey): string
    {
        if ($profileKey === '' || strlen($profileKey) > 512 || preg_match('/[\x00-\x1f\x7f]/u', $profileKey) === 1) {
            throw new \InvalidArgumentException('The Profile key is invalid.');
        }
        return $this->root . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', $profileKey);
    }

    private static function isAbsolute(string $path): bool
    {
        return str_starts_with($path, DIRECTORY_SEPARATOR) || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }
}

final class FilesystemProfileLock implements ProfileLock
{
    private ProfileStatePaths $paths;

    public function __construct(string $stateRoot)
    {
        $this->paths = new ProfileStatePaths($stateRoot);
    }

    public function tryAcquire(string $profileKey): ?ProfileLockLease
    {
        $directory = $this->paths->profileDirectory($profileKey);
        $this->ensureSafeDirectory($this->paths->root());
        $this->ensureSafeDirectory(dirname($directory));
        $this->ensureSafeDirectory($directory);
        $path = $directory . DIRECTORY_SEPARATOR . 'lock';
        if (is_link($path) || (file_exists($path) && !is_file($path))) {
            throw new LocalStateException('Unsafe local lock state.');
        }
        $handle = @fopen($path, 'c+b');
        if ($handle === false) {
            throw new LocalStateException('Local lock cannot be opened.');
        }
        @chmod($path, 0600);
        if (!flock($handle, LOCK_EX | LOCK_NB)) {
            fclose($handle);
            return null;
        }
        return new NativeProfileLockLease($handle);
    }

    private function ensureSafeDirectory(string $path): void
    {
        if (is_link($path) || (file_exists($path) && !is_dir($path))) {
            throw new LocalStateException('Unsafe local state path.');
        }
        if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) {
            throw new LocalStateException('Local state directory cannot be created.');
        }
        @chmod($path, 0700);
    }
}

final class NativeProfileLockLease implements ProfileLockLease
{
    /** @param resource $handle */
    public function __construct(private $handle)
    {
    }

    public function release(): void
    {
        if ($this->handle === null) {
            return;
        }
        $handle = $this->handle;
        $this->handle = null;
        if (!flock($handle, LOCK_UN) || !fclose($handle)) {
            throw new LocalStateException('Local lock release failed.');
        }
    }

    public function __destruct()
    {
        if ($this->handle !== null) {
            @flock($this->handle, LOCK_UN);
            @fclose($this->handle);
        }
    }
}
