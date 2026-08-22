<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

interface SynchronizationClock
{
    public function now(): \DateTimeImmutable;
}

interface SynchronizationSleeper
{
    public function sleep(int $seconds): void;
}

interface ProfileLockLease
{
    public function release(): void;
}

interface ProfileLock
{
    public function tryAcquire(string $profileKey): ?ProfileLockLease;
}

final class ActiveProfileSnapshot
{
    /** @param array<int, DistributionArticle> $items */
    public function __construct(
        public readonly string $profileKey,
        public readonly DistributionProfile $profile,
        public readonly DistributionPublication $publication,
        public readonly string $apiVersion,
        public readonly string $snapshotRevision,
        public readonly ?string $etag,
        public readonly string $generatedAt,
        public readonly array $items,
    ) {
        if ($profileKey === '' || $profile->configKey !== $profileKey || $apiVersion !== 'v1' || $snapshotRevision === '') {
            throw new \InvalidArgumentException('The active snapshot is inconsistent.');
        }
    }
}

final class LocalProfileState
{
    public function __construct(
        public readonly string $profileKey,
        public readonly ?ActiveProfileSnapshot $active,
        public readonly bool $disabled,
        public readonly ?\DateTimeImmutable $lastSuccessfulSyncAt,
    ) {
        if ($profileKey === '' || ($active !== null && $active->profileKey !== $profileKey)) {
            throw new \InvalidArgumentException('The local Profile state is inconsistent.');
        }
    }
}

final class SynchronizationFacts
{
    public function __construct(
        public readonly string $profileKey,
        public readonly string $outcome,
        public readonly \DateTimeImmutable $attemptedAt,
        public readonly \DateTimeImmutable $completedAt,
        public readonly float $durationSeconds,
        public readonly ?int $itemCount,
        public readonly ?int $pageCount,
        public readonly bool $unchanged,
        public readonly ?string $failureCategory,
        public readonly ?\DateTimeImmutable $lastSuccessfulSyncAt,
        public readonly string $adapterVersion,
    ) {
    }
}

final class ProfileActivation
{
    /** @param array<int, DistributionArticle> $items */
    public function __construct(
        public readonly string $profileKey,
        public readonly DistributionProfile $profile,
        public readonly DistributionPublication $publication,
        public readonly string $apiVersion,
        public readonly string $snapshotRevision,
        public readonly ?string $etag,
        public readonly string $generatedAt,
        public readonly array $items,
        public readonly SynchronizationFacts $facts,
    ) {
    }
}

final class ProfileCandidate
{
    /** @param array<int, DistributionArticle> $items */
    public function __construct(
        public readonly string $profileKey,
        public readonly DistributionProfile $profile,
        public readonly DistributionPublication $publication,
        public readonly string $apiVersion,
        public readonly string $snapshotRevision,
        public readonly ?string $etag,
        public readonly string $generatedAt,
        public readonly array $items,
    ) {
    }
}

final class UnchangedSynchronization
{
    public function __construct(
        public readonly string $profileKey,
        public readonly ?string $etag,
        public readonly SynchronizationFacts $facts,
    ) {
    }
}

interface ProfileSynchronizationStore
{
    /** The implementation must preserve the prior active snapshot if this operation fails. */
    public function load(string $profileKey): LocalProfileState;

    /** Atomically activates this complete candidate and records its successful facts. */
    public function activate(ProfileActivation $activation): void;

    /** Records a successful conditional read and clears authoritative disabled state. */
    public function recordUnchanged(UnchangedSynchronization $unchanged): void;

    /** Retains active snapshot data while persistently suppressing its public usability. */
    public function markDisabled(string $profileKey, SynchronizationFacts $facts): void;

    /** Records bounded operational failure facts without changing active/disabled state. */
    public function recordFailure(string $profileKey, SynchronizationFacts $facts): void;
}

final class SynchronizerConfiguration
{
    public function __construct(
        public readonly int $maxRetries = 2,
        public readonly int $normalRetryDelaySeconds = 1,
        public readonly int $maximumRetryAfterSeconds = 60,
        public readonly int $maximumPages = 512,
        public readonly int $maximumCandidateItems = 10_000,
        public readonly int $maxSnapshotRestarts = 2,
        public readonly string $adapterVersion = 'news-scraper-php',
    ) {
        if (
            $maxRetries < 0 || $maxRetries > 10 ||
            $normalRetryDelaySeconds < 1 || $normalRetryDelaySeconds > 60 ||
            $maximumRetryAfterSeconds < 1 || $maximumRetryAfterSeconds > 3_600 ||
            $maximumPages < 1 || $maximumPages > 10_000 ||
            $maximumCandidateItems < 1 || $maximumCandidateItems > 100_000 ||
            $maxSnapshotRestarts < 0 || $maxSnapshotRestarts > 10 ||
            $adapterVersion === '' || strlen($adapterVersion) > 128
        ) {
            throw new \InvalidArgumentException('The synchronization bounds are invalid.');
        }
    }
}

final class SynchronizationResult
{
    public const SUCCESS = 'success';
    public const UNCHANGED = 'unchanged';
    public const FAILED = 'failed';
    public const DISABLED = 'disabled';
    public const ALREADY_RUNNING = 'already_running';

    public function __construct(
        public readonly SynchronizationFacts $facts,
    ) {
    }
}

final class PositionFetchResult
{
    public function __construct(
        public readonly DistributionOutcome $outcome,
        public readonly ?string $failureCategory = null,
    ) {
    }
}

final class CandidateTraversalResult
{
    public const CANDIDATE = 'candidate';
    public const SNAPSHOT_CHANGED = 'snapshot_changed';
    public const DISABLED = 'disabled';
    public const UNCHANGED = 'unchanged';
    public const FAILURE = 'failure';

    public function __construct(
        public readonly string $kind,
        public readonly ?ProfileCandidate $candidate,
        public readonly ?DistributionOutcome $outcome,
        public readonly ?string $failureCategory,
        public readonly int $itemCount,
        public readonly int $pageCount,
    ) {
    }
}

final class ProfileSynchronizer
{
    public function __construct(
        private readonly DistributionPageClient $client,
        private readonly ProfileSynchronizationStore $store,
        private readonly ProfileLock $lock,
        private readonly SynchronizationClock $clock,
        private readonly SynchronizationSleeper $sleeper,
        private readonly SynchronizerConfiguration $configuration = new SynchronizerConfiguration(),
    ) {
    }

    public function synchronize(string $profileKey): SynchronizationResult
    {
        $startedAt = $this->clock->now();
        try {
            $lease = $this->lock->tryAcquire($profileKey);
        } catch (\Throwable) {
            return $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, null, null, null, false, 'lock_failure');
        }
        if ($lease === null) {
            return $this->result($profileKey, SynchronizationResult::ALREADY_RUNNING, $startedAt, null, null, null, false, null);
        }

        $state = null;
        try {
            $result = $this->synchronizeWhileLocked($profileKey, $startedAt, $state);
        } catch (\Throwable) {
            $result = $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, $state, null, null, false, 'local_failure');
        }

        try {
            $lease->release();
        } catch (\Throwable) {
            return $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, $state, null, null, false, 'lock_release_failure');
        }

        return $result;
    }

    private function synchronizeWhileLocked(
        string $profileKey,
        \DateTimeImmutable $startedAt,
        ?LocalProfileState &$state,
    ): SynchronizationResult {
        try {
            $state = $this->store->load($profileKey);
        } catch (\Throwable) {
            return $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, null, null, null, false, 'local_persistence_failure');
        }
        if ($state->profileKey !== $profileKey) {
            return $this->failure($profileKey, $startedAt, $state, 'invalid_local_state', null, null);
        }

        for ($restart = 0; $restart <= $this->configuration->maxSnapshotRestarts; $restart++) {
            $traversal = $this->traverseCandidate($profileKey, $state);
            if ($traversal->kind === CandidateTraversalResult::SNAPSHOT_CHANGED) {
                if ($restart < $this->configuration->maxSnapshotRestarts) {
                    continue;
                }
                return $this->failure($profileKey, $startedAt, $state, 'snapshot_restart_exhausted', $traversal->itemCount, $traversal->pageCount);
            }
            if ($traversal->kind === CandidateTraversalResult::DISABLED) {
                $facts = $this->facts($profileKey, SynchronizationResult::DISABLED, $startedAt, $state, $traversal->itemCount, $traversal->pageCount, false, null);
                try {
                    $this->store->markDisabled($profileKey, $facts);
                } catch (\Throwable) {
                    return $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, $state, $traversal->itemCount, $traversal->pageCount, false, 'local_persistence_failure');
                }
                return new SynchronizationResult($facts);
            }
            if ($traversal->kind === CandidateTraversalResult::UNCHANGED) {
                if ($state->active === null) {
                    return $this->failure($profileKey, $startedAt, $state, 'not_modified_without_active', null, null);
                }
                $facts = $this->facts($profileKey, SynchronizationResult::UNCHANGED, $startedAt, $state, count($state->active->items), null, true, null, $this->clock->now());
                $etag = $traversal->outcome?->etag ?? $state->active->etag;
                try {
                    $this->store->recordUnchanged(new UnchangedSynchronization($profileKey, $etag, $facts));
                } catch (\Throwable) {
                    return $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, $state, count($state->active->items), null, false, 'local_persistence_failure');
                }
                return new SynchronizationResult($facts);
            }
            if ($traversal->kind === CandidateTraversalResult::FAILURE) {
                return $this->failure($profileKey, $startedAt, $state, $traversal->failureCategory ?? 'upstream_failure', $traversal->itemCount, $traversal->pageCount);
            }

            $facts = $this->facts($profileKey, SynchronizationResult::SUCCESS, $startedAt, $state, $traversal->itemCount, $traversal->pageCount, false, null, $this->clock->now());
            $candidate = $traversal->candidate;
            if ($candidate === null) {
                return $this->failure($profileKey, $startedAt, $state, 'candidate_missing', null, null);
            }
            $activation = new ProfileActivation(
                $candidate->profileKey,
                $candidate->profile,
                $candidate->publication,
                $candidate->apiVersion,
                $candidate->snapshotRevision,
                $candidate->etag,
                $candidate->generatedAt,
                $candidate->items,
                $facts,
            );
            try {
                $this->store->activate($activation);
            } catch (\Throwable) {
                return $this->failure($profileKey, $startedAt, $state, 'activation_failed', $traversal->itemCount, $traversal->pageCount);
            }
            return new SynchronizationResult($facts);
        }

        return $this->failure($profileKey, $startedAt, $state, 'snapshot_restart_exhausted', null, null);
    }

    private function traverseCandidate(string $profileKey, LocalProfileState $state): CandidateTraversalResult
    {
        $initial = $this->fetchPosition($profileKey, null, $state->active?->etag);
        if (!$initial->outcome->isSuccess()) {
            return $this->nonPageTraversalResult($initial, true, 0, 0);
        }
        $page = $initial->outcome->page;
        if ($page === null) {
            return $this->failureTraversal('invalid_page_outcome', 0, 0);
        }

        if ($page->apiVersion !== 'v1' || $page->profile->configKey !== $profileKey) {
            return $this->failureTraversal('candidate_identity_mismatch', 0, 0);
        }
        $candidate = new ProfileCandidate(
            $profileKey,
            $page->profile,
            $page->publication,
            $page->apiVersion,
            $page->snapshotRevision,
            $page->etag,
            $page->generatedAt,
            $page->items,
        );
        $items = $page->items;
        $pages = 1;
        if (count($items) > $this->configuration->maximumCandidateItems) {
            return $this->failureTraversal('candidate_item_limit_exceeded', count($items), $pages);
        }

        $seenCursors = [];
        $nextCursor = $page->nextCursor;
        while ($nextCursor !== null) {
            if (isset($seenCursors[$nextCursor])) {
                return $this->failureTraversal('cursor_loop', count($items), $pages);
            }
            $seenCursors[$nextCursor] = true;
            if ($pages >= $this->configuration->maximumPages) {
                return $this->failureTraversal('candidate_page_limit_exceeded', count($items), $pages);
            }

            $continuation = $this->fetchPosition($profileKey, $nextCursor, null);
            if (!$continuation->outcome->isSuccess()) {
                return $this->nonPageTraversalResult($continuation, false, count($items), $pages);
            }
            $page = $continuation->outcome->page;
            if ($page === null || !$this->sameCandidateIdentity($candidate, $page, $profileKey)) {
                return $this->failureTraversal('candidate_identity_mismatch', count($items), $pages);
            }
            $pages++;
            foreach ($page->items as $item) {
                $items[] = $item;
            }
            if (count($items) > $this->configuration->maximumCandidateItems) {
                return $this->failureTraversal('candidate_item_limit_exceeded', count($items), $pages);
            }
            $nextCursor = $page->nextCursor;
        }

        return new CandidateTraversalResult(CandidateTraversalResult::CANDIDATE, new ProfileCandidate(
            $candidate->profileKey,
            $candidate->profile,
            $candidate->publication,
            $candidate->apiVersion,
            $candidate->snapshotRevision,
            $candidate->etag,
            $candidate->generatedAt,
            $items,
        ), null, null, count($items), $pages);
    }

    private function fetchPosition(string $profileKey, ?string $cursor, ?string $activeEtag): PositionFetchResult
    {
        $retries = 0;
        while (true) {
            try {
                $outcome = $this->client->fetchPage($profileKey, $cursor, $activeEtag);
            } catch (\Throwable) {
                $outcome = new DistributionOutcome(DistributionOutcome::TRANSPORT_FAILURE);
            }
            if (!$this->retryable($outcome)) {
                return new PositionFetchResult($outcome);
            }
            if ($outcome->kind === DistributionOutcome::RATE_LIMITED) {
                $delay = $outcome->retryAfterSeconds;
                if ($delay === null || $delay < 1) {
                    return new PositionFetchResult($outcome, 'invalid_retry_after');
                }
                if ($delay > $this->configuration->maximumRetryAfterSeconds) {
                    return new PositionFetchResult($outcome, 'retry_after_exceeds_maximum');
                }
            } else {
                $delay = min(
                    $this->configuration->normalRetryDelaySeconds * (2 ** $retries),
                    $this->configuration->maximumRetryAfterSeconds,
                );
            }
            if ($retries >= $this->configuration->maxRetries) {
                return new PositionFetchResult($outcome, 'retry_exhausted');
            }
            try {
                $this->sleeper->sleep($delay);
            } catch (\Throwable) {
                return new PositionFetchResult($outcome, 'sleeper_failure');
            }
            $retries++;
        }
    }

    private function retryable(DistributionOutcome $outcome): bool
    {
        return in_array($outcome->kind, [
            DistributionOutcome::TRANSPORT_FAILURE,
            DistributionOutcome::SERVICE_UNAVAILABLE,
            DistributionOutcome::RATE_LIMITED,
        ], true);
    }

    private function nonPageTraversalResult(PositionFetchResult $fetch, bool $initial, int $items, int $pages): CandidateTraversalResult
    {
        if ($fetch->failureCategory !== null) {
            return $this->failureTraversal($fetch->failureCategory, $items, $pages);
        }
        return match ($fetch->outcome->kind) {
            DistributionOutcome::SNAPSHOT_CHANGED => new CandidateTraversalResult(CandidateTraversalResult::SNAPSHOT_CHANGED, null, $fetch->outcome, null, $items, $pages),
            DistributionOutcome::PROFILE_DISABLED => new CandidateTraversalResult(CandidateTraversalResult::DISABLED, null, $fetch->outcome, null, $items, $pages),
            DistributionOutcome::NOT_MODIFIED => $initial
                ? new CandidateTraversalResult(CandidateTraversalResult::UNCHANGED, null, $fetch->outcome, null, $items, $pages)
                : $this->failureTraversal('unexpected_continuation_outcome', $items, $pages),
            DistributionOutcome::UNAUTHENTICATED => $this->failureTraversal('unauthenticated', $items, $pages),
            DistributionOutcome::INVALID_REQUEST => $this->failureTraversal('invalid_request', $items, $pages),
            DistributionOutcome::NOT_FOUND => $this->failureTraversal('not_found', $items, $pages),
            DistributionOutcome::INVALID_RESPONSE => $this->failureTraversal('invalid_upstream_response', $items, $pages),
            default => $this->failureTraversal('unexpected_upstream_outcome', $items, $pages),
        };
    }

    private function failureTraversal(string $category, int $items, int $pages): CandidateTraversalResult
    {
        return new CandidateTraversalResult(CandidateTraversalResult::FAILURE, null, null, $category, $items, $pages);
    }

    private function sameCandidateIdentity(ProfileCandidate $candidate, DistributionPage $page, string $profileKey): bool
    {
        return $page->apiVersion === $candidate->apiVersion &&
            $page->profile->configKey === $profileKey &&
            $page->profile->configKey === $candidate->profile->configKey &&
            $page->profile->displayName === $candidate->profile->displayName &&
            $page->publication->name === $candidate->publication->name &&
            $page->snapshotRevision === $candidate->snapshotRevision;
    }

    private function failure(
        string $profileKey,
        \DateTimeImmutable $startedAt,
        LocalProfileState $state,
        string $category,
        ?int $items,
        ?int $pages,
    ): SynchronizationResult {
        $facts = $this->facts($profileKey, SynchronizationResult::FAILED, $startedAt, $state, $items, $pages, false, $category);
        try {
            $this->store->recordFailure($profileKey, $facts);
        } catch (\Throwable) {
            return $this->result($profileKey, SynchronizationResult::FAILED, $startedAt, $state, $items, $pages, false, 'local_persistence_failure');
        }
        return new SynchronizationResult($facts);
    }

    private function facts(
        string $profileKey,
        string $outcome,
        \DateTimeImmutable $startedAt,
        ?LocalProfileState $state,
        ?int $items,
        ?int $pages,
        bool $unchanged,
        ?string $failureCategory,
        ?\DateTimeImmutable $successfulAt = null,
    ): SynchronizationFacts {
        $completedAt = $this->clock->now();
        $lastSuccess = $successfulAt ?? $state?->lastSuccessfulSyncAt;
        return new SynchronizationFacts(
            $profileKey,
            $outcome,
            $startedAt,
            $completedAt,
            max(0.0, (float) $completedAt->format('U.u') - (float) $startedAt->format('U.u')),
            $items,
            $pages,
            $unchanged,
            $failureCategory,
            $lastSuccess,
            $this->configuration->adapterVersion,
        );
    }

    private function result(
        string $profileKey,
        string $outcome,
        \DateTimeImmutable $startedAt,
        ?LocalProfileState $state,
        ?int $items,
        ?int $pages,
        bool $unchanged,
        ?string $failureCategory,
    ): SynchronizationResult {
        return new SynchronizationResult($this->facts($profileKey, $outcome, $startedAt, $state, $items, $pages, $unchanged, $failureCategory));
    }

}
