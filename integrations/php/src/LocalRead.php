<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

/**
 * Configuration needed by an ordinary customer-side local read.
 *
 * This intentionally has no upstream URL or credential fields. Synchronization
 * configuration remains owned by IntegrationRuntimeConfiguration.
 */
final class LocalReadConfiguration
{
    public const DEFAULT_CADENCE_SECONDS = 900;

    private string $stateRoot;

    public function __construct(
        public readonly string $profileKey,
        string $stateRoot,
        public readonly int $cadenceSeconds = self::DEFAULT_CADENCE_SECONDS,
        public readonly ?int $maximumStaleAgeSeconds = null,
    ) {
        $paths = new ProfileStatePaths($stateRoot);
        $paths->profileDirectory($profileKey);
        new LocalProfileUsabilityResolver($cadenceSeconds, $maximumStaleAgeSeconds);
        $this->stateRoot = $paths->root();
    }

    public function stateRoot(): string
    {
        return $this->stateRoot;
    }

    /** @param array<string, string|false> $environment */
    public static function fromEnvironment(array $environment): self
    {
        foreach (['NEWS_SCRAPER_PROFILE_KEY', 'NEWS_SCRAPER_STATE_ROOT'] as $name) {
            if (!isset($environment[$name]) || $environment[$name] === '') {
                throw new \InvalidArgumentException('Missing required local-read configuration: ' . $name . '.');
            }
        }

        return new self(
            (string) $environment['NEWS_SCRAPER_PROFILE_KEY'],
            (string) $environment['NEWS_SCRAPER_STATE_ROOT'],
            self::positiveInteger($environment['NEWS_SCRAPER_SYNC_CADENCE_SECONDS'] ?? null, self::DEFAULT_CADENCE_SECONDS, 'sync cadence'),
            self::nullablePositiveInteger($environment['NEWS_SCRAPER_MAX_STALE_AGE_SECONDS'] ?? null, 'maximum stale age'),
        );
    }

    private static function positiveInteger(string|false|null $value, int $default, string $field): int
    {
        if ($value === null || $value === false || $value === '') {
            return $default;
        }
        if (preg_match('/^[1-9][0-9]*$/D', $value) !== 1) {
            throw new \InvalidArgumentException('Invalid ' . $field . ' configuration.');
        }
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($parsed === false) {
            throw new \InvalidArgumentException('Invalid ' . $field . ' configuration.');
        }
        return $parsed;
    }

    private static function nullablePositiveInteger(string|false|null $value, string $field): ?int
    {
        return ($value === null || $value === false || $value === '')
            ? null
            : self::positiveInteger($value, 1, $field);
    }
}

final class LocalReadPublication
{
    public function __construct(public readonly string $name)
    {
    }
}

final class LocalReadProfile
{
    public function __construct(
        public readonly string $configKey,
        public readonly string $displayName,
    ) {
    }
}

final class LocalReadSource
{
    public function __construct(
        public readonly string $configKey,
        public readonly string $displayName,
    ) {
    }
}

final class LocalReadCategory
{
    public function __construct(
        public readonly string $configKey,
        public readonly string $displayName,
    ) {
    }
}

final class LocalReadArticle
{
    /** @param array<int, LocalReadCategory> $categories */
    public function __construct(
        public readonly string $articleId,
        public readonly string $headline,
        public readonly string $originalUrl,
        public readonly string $effectiveFeedDate,
        public readonly string $feedDateSource,
        public readonly ?string $publishedAt,
        public readonly ?string $author,
        public readonly ?string $summary,
        public readonly ?string $imageUrl,
        public readonly LocalReadSource $source,
        public readonly array $categories,
    ) {
    }
}

final class LocalReadHealth
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

final class LocalReadResult
{
    public const USABLE = LocalProfileUsability::USABLE;
    public const STALE_USABLE = LocalProfileUsability::STALE_USABLE;
    public const NEVER_SYNCED = LocalProfileUsability::NEVER_SYNCED;
    public const STALE_CUTOFF = LocalProfileUsability::STALE_CUTOFF;
    public const DISABLED = LocalProfileUsability::DISABLED;
    public const UNAVAILABLE = LocalProfileUsability::UNAVAILABLE;

    /** @param array<int, LocalReadArticle> $articles */
    public function __construct(
        public readonly string $state,
        public readonly ?LocalReadProfile $profile,
        public readonly ?LocalReadPublication $publication,
        public readonly array $articles,
        public readonly ?int $staleAgeSeconds,
    public readonly LocalReadHealth $health,
    ) {
        if (!in_array($state, [self::USABLE, self::STALE_USABLE, self::NEVER_SYNCED, self::STALE_CUTOFF, self::DISABLED, self::UNAVAILABLE], true)) {
            throw new \InvalidArgumentException('The local read state is invalid.');
        }
        $renderable = $state === self::USABLE || $state === self::STALE_USABLE;
        if ($renderable !== ($profile !== null && $publication !== null)) {
            throw new \InvalidArgumentException('The local read payload does not match its state.');
        }
        if (!$renderable && $articles !== []) {
            throw new \InvalidArgumentException('Non-renderable local state cannot contain Articles.');
        }
    }

    public function isRenderable(): bool
    {
        return $this->profile !== null && $this->publication !== null;
    }
}

final class LocalProfileReader
{
    private readonly FilesystemProfileStateStore $store;
    private readonly SynchronizationClock $clock;
    private readonly LocalProfileUsabilityResolver $resolver;

    public function __construct(
        private readonly LocalReadConfiguration $configuration,
        ?FilesystemProfileStateStore $store = null,
        ?SynchronizationClock $clock = null,
    ) {
        $this->store = $store ?? new FilesystemProfileStateStore($configuration->stateRoot());
        $this->clock = $clock ?? new SystemSynchronizationClock();
        $this->resolver = new LocalProfileUsabilityResolver($configuration->cadenceSeconds, $configuration->maximumStaleAgeSeconds);
    }

    public function read(): LocalReadResult
    {
        $read = $this->store->readForPhase6($this->configuration->profileKey, $this->resolver, $this->clock);
        $health = $this->healthFrom($read->health);
        $state = $read->usability->classification;
        $renderable = $state === LocalProfileUsability::USABLE || $state === LocalProfileUsability::STALE_USABLE;

        if (!$renderable || $read->active === null) {
            return new LocalReadResult($state, null, null, [], $read->usability->staleAgeSeconds, $health);
        }

        return new LocalReadResult(
            $state,
            new LocalReadProfile($read->active->profile->configKey, $read->active->profile->displayName),
            new LocalReadPublication($read->active->publication->name),
            array_map(static fn (DistributionArticle $article): LocalReadArticle => self::articleFrom($article), $read->active->items),
            $read->usability->staleAgeSeconds,
            $health,
        );
    }

    private static function articleFrom(DistributionArticle $article): LocalReadArticle
    {
        return new LocalReadArticle(
            $article->articleId,
            $article->headline,
            $article->originalUrl,
            $article->effectiveFeedDate,
            $article->feedDateSource,
            $article->publishedAt,
            $article->author,
            $article->summary,
            $article->imageUrl,
            new LocalReadSource($article->source->configKey, $article->source->displayName),
            array_map(
                static fn (DistributionCategory $category): LocalReadCategory => new LocalReadCategory($category->configKey, $category->displayName),
                $article->categories,
            ),
        );
    }

    private function healthFrom(LocalProfileHealth $health): LocalReadHealth
    {
        return new LocalReadHealth(
            $health->profileKey,
            $health->lastAttemptAt,
            $health->lastSuccessfulSyncAt,
            $health->syncResult,
            $health->durationSeconds,
            $health->itemCount,
            $health->pageCount,
            $health->unchanged,
            $health->activeRevision,
            $health->activeEtag,
            $health->failureCategory,
            $health->disabled,
            $health->adapterVersion,
        );
    }
}
