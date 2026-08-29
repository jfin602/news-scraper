<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class IntegrationRuntimeConfiguration
{
    public const DEFAULT_CADENCE_SECONDS = 900;

    public function __construct(
        public readonly string $baseUrl,
        public readonly string $profileKey,
        public readonly string $stateRoot,
        public readonly string $bearerCredential,
        public readonly int $cadenceSeconds = self::DEFAULT_CADENCE_SECONDS,
        public readonly ?int $maximumStaleAgeSeconds = null,
        public readonly int $timeoutSeconds = 20,
        public readonly int $maxResponseBytes = 2_097_152,
    ) {
        new ClientConfiguration($baseUrl, $bearerCredential, $timeoutSeconds, $maxResponseBytes);
        new ProfileStatePaths($stateRoot);
        if ($profileKey === '' || strlen($profileKey) > 512 || preg_match('/[\x00-\x1f\x7f]/u', $profileKey) === 1) throw new \InvalidArgumentException('The Profile key is invalid.');
        if ($cadenceSeconds < 1 || $cadenceSeconds > 86_400 || ($maximumStaleAgeSeconds !== null && ($maximumStaleAgeSeconds < 1 || $maximumStaleAgeSeconds > 31_536_000))) throw new \InvalidArgumentException('The cadence or stale-age setting is invalid.');
    }

    /** @param array<string, string|false> $environment */
    public static function fromEnvironment(array $environment): self
    {
        $required = ['NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_PROFILE_KEY', 'NEWS_SCRAPER_STATE_ROOT', 'NEWS_SCRAPER_BEARER_TOKEN'];
        foreach ($required as $name) if (!isset($environment[$name]) || $environment[$name] === '') throw new \InvalidArgumentException('Missing required runtime configuration: ' . $name . '.');
        return new self(
            (string) $environment['NEWS_SCRAPER_BASE_URL'], (string) $environment['NEWS_SCRAPER_PROFILE_KEY'], (string) $environment['NEWS_SCRAPER_STATE_ROOT'], (string) $environment['NEWS_SCRAPER_BEARER_TOKEN'],
            self::positiveInteger($environment['NEWS_SCRAPER_SYNC_CADENCE_SECONDS'] ?? null, self::DEFAULT_CADENCE_SECONDS, 'sync cadence'),
            self::nullablePositiveInteger($environment['NEWS_SCRAPER_MAX_STALE_AGE_SECONDS'] ?? null, 'maximum stale age'),
            self::positiveInteger($environment['NEWS_SCRAPER_TIMEOUT_SECONDS'] ?? null, 20, 'timeout'),
            self::positiveInteger($environment['NEWS_SCRAPER_MAX_RESPONSE_BYTES'] ?? null, 2_097_152, 'response limit'),
        );
    }

    private static function positiveInteger(string|false|null $value, int $default, string $field): int
    {
        if ($value === null || $value === false || $value === '') return $default;
        if (preg_match('/^[1-9][0-9]*$/D', $value) !== 1) throw new \InvalidArgumentException('Invalid ' . $field . ' configuration.');
        return (int) $value;
    }
    private static function nullablePositiveInteger(string|false|null $value, string $field): ?int { return ($value === null || $value === false || $value === '') ? null : self::positiveInteger($value, 1, $field); }
}

final class CadenceDecision
{
    public function __construct(public readonly bool $due, public readonly string $reason) {}
}

final class ProfileCadence
{
    public function __construct(private readonly int $cadenceSeconds = IntegrationRuntimeConfiguration::DEFAULT_CADENCE_SECONDS)
    {
        if ($cadenceSeconds < 1 || $cadenceSeconds > 86_400) throw new \InvalidArgumentException('The cadence is invalid.');
    }

    public function decide(LocalProfileHealth $health, \DateTimeImmutable $now, bool $force = false): CadenceDecision
    {
        if ($force) return new CadenceDecision(true, 'forced');
        if ($health->lastAttemptAt === null) return new CadenceDecision(true, 'never_attempted');
        // Attempts, rather than successes, anchor cadence so repeated failed cron runs cannot hammer upstream.
        $elapsed = max(0, (int) $now->format('U') - (int) $health->lastAttemptAt->format('U'));
        return $elapsed >= $this->cadenceSeconds ? new CadenceDecision(true, 'due') : new CadenceDecision(false, 'not_due');
    }
}

final class ProfileSyncRuntime
{
    public function __construct(
        private readonly FilesystemProfileStateStore $store,
        private readonly ProfileSynchronizer $synchronizer,
        private readonly ProfileCadence $cadence,
        private readonly SynchronizationClock $clock,
    ) {}

    public function run(string $profileKey, bool $force = false): SynchronizationResult|CadenceDecision
    {
        $decision = $this->cadence->decide($this->store->health($profileKey), $this->clock->now(), $force);
        return $decision->due ? $this->synchronizer->synchronize($profileKey) : $decision;
    }
}

final class IntegrationRuntimeFactory
{
    public static function create(IntegrationRuntimeConfiguration $configuration, ?string $installedPackageVersion = null): ProfileSyncRuntime
    {
        $clock = new SystemSynchronizationClock();
        $store = new FilesystemProfileStateStore($configuration->stateRoot, new NativeLocalFilesystem(), $installedPackageVersion);
        return new ProfileSyncRuntime(
            $store,
            new ProfileSynchronizer(
                new DistributionClient(new ClientConfiguration($configuration->baseUrl, $configuration->bearerCredential, $configuration->timeoutSeconds, $configuration->maxResponseBytes), new NativeHttpTransport()),
                $store, new FilesystemProfileLock($configuration->stateRoot), $clock, new NativeSynchronizationSleeper(),
            ),
            new ProfileCadence($configuration->cadenceSeconds), $clock,
        );
    }
}

final class SynchronizationCommand
{
    /** @param array<int, string> $arguments */
    public static function run(IntegrationRuntimeConfiguration $configuration, array $arguments, ?string $installedPackageVersion = null): int
    {
        $force = in_array('--force', $arguments, true);
        if (count(array_filter($arguments, static fn (string $argument): bool => $argument !== '--force')) > 0) {
            fwrite(STDERR, "configuration_error invalid CLI option\n");
            return 2;
        }
        try {
            $result = IntegrationRuntimeFactory::create($configuration, $installedPackageVersion)->run($configuration->profileKey, $force);
            if ($result instanceof CadenceDecision) {
                fwrite(STDOUT, "not_due profile=" . $configuration->profileKey . "\n");
                return 0;
            }
            $line = $result->facts->outcome . ' profile=' . $configuration->profileKey;
            if ($result->facts->failureCategory !== null) $line .= ' category=' . $result->facts->failureCategory;
            fwrite($result->facts->outcome === SynchronizationResult::FAILED ? STDERR : STDOUT, $line . "\n");
            return $result->facts->outcome === SynchronizationResult::FAILED ? 1 : 0;
        } catch (\InvalidArgumentException $error) {
            fwrite(STDERR, "configuration_error " . $error->getMessage() . "\n");
            return 2;
        } catch (\Throwable) {
            fwrite(STDERR, "configuration_or_local_state_error\n");
            return 2;
        }
    }
}
