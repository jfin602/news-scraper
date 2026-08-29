<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use NewsScraper\Integration\Php\DistributionArticle;
use NewsScraper\Integration\Php\DistributionCategory;
use NewsScraper\Integration\Php\DistributionDigest;
use NewsScraper\Integration\Php\DistributionDigestHighlight;
use NewsScraper\Integration\Php\DistributionDigestSupport;
use NewsScraper\Integration\Php\DistributionOutcome;
use NewsScraper\Integration\Php\DistributionPage;
use NewsScraper\Integration\Php\DistributionPageClient;
use NewsScraper\Integration\Php\DistributionProfile;
use NewsScraper\Integration\Php\DistributionPublication;
use NewsScraper\Integration\Php\DistributionSource;
use NewsScraper\Integration\Php\FilesystemProfileLock;
use NewsScraper\Integration\Php\FilesystemProfileStateStore;
use NewsScraper\Integration\Php\ProfileSynchronizer;
use NewsScraper\Integration\Php\SynchronizationClock;
use NewsScraper\Integration\Php\SynchronizationResult;
use NewsScraper\Integration\Php\SynchronizationSleeper;
use NewsScraper\Integration\Php\SynchronizationFacts;

[$script, $root, $scenario] = $argv + [null, null, null];
if (!is_string($root) || !is_string($scenario)) exit(2);

final class ExampleClock implements SynchronizationClock { public function __construct(private DateTimeImmutable $now) {} public function now(): DateTimeImmutable { return $this->now; } }
final class ExampleSleeper implements SynchronizationSleeper { public function sleep(int $seconds): void {} }
final class ExampleClient implements DistributionPageClient {
    public function __construct(private DistributionPage $page) {}
    public function fetchPage(string $profileKey, ?string $cursor = null, ?string $activeEtag = null): DistributionOutcome { return new DistributionOutcome(DistributionOutcome::SUCCESS, $this->page, $this->page->etag); }
}

$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
$items = $scenario === 'empty' ? [] : [
    new DistributionArticle('first', '<script>globalThis.pwned=1</script> First', 'https://publisher.example.test/first?quoted="yes"&x=1', $now->format(DATE_ATOM), 'published_at', null, 'Author <img src=x onerror=alert(1)>', 'Summary <script>alert(1)</script>', null, new DistributionSource('publisher', 'Source <b>One</b>'), [new DistributionCategory('news', 'Category <i>One</i>')]),
    new DistributionArticle('second', 'Second headline', 'https://publisher.example.test/second', $now->modify('-1 minute')->format(DATE_ATOM), 'published_at', null, null, null, null, new DistributionSource('publisher', 'Publisher'), []),
];
$at = match ($scenario) { 'stale' => $now->modify('-901 seconds'), 'cutoff' => $now->modify('-901 seconds'), default => $now };
$digest = $scenario === 'digest'
    ? new DistributionDigest(
        $now->format(DATE_ATOM),
        'current',
        2,
        'provider-not-for-readers',
        'model-not-for-readers',
        'Overview <script>alert(1)</script>',
        [new DistributionDigestHighlight('Highlight <b>One</b>', 'Explanation <img src=x>', [new DistributionDigestSupport('first', 'Support <script>alert(2)</script>', 'Source <b>One</b>', $now->format(DATE_ATOM), 'https://publisher.example.test/first?quoted="yes"&x=1')])],
    )
    : null;
$page = new DistributionPage('v1', $at->format(DATE_ATOM), 'example-revision', new DistributionProfile('weekly-desk', 'Profile <em>Name</em>'), new DistributionPublication('Publication <strong>Name</strong>'), $items, $digest, 'example-etag');
$store = new FilesystemProfileStateStore($root);
$sync = new ProfileSynchronizer(new ExampleClient($page), $store, new FilesystemProfileLock($root), new ExampleClock($at), new ExampleSleeper());
if ($scenario !== 'never') {
    $result = $sync->synchronize('weekly-desk');
    if ($result->facts->outcome !== SynchronizationResult::SUCCESS) exit(3);
}
if ($scenario === 'disabled') $store->markDisabled('weekly-desk', new SynchronizationFacts('weekly-desk', SynchronizationResult::DISABLED, $now, $now, 0.1, count($items), 1, false, null, $at, 'example'));
if ($scenario === 'unavailable') file_put_contents($root . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk') . DIRECTORY_SEPARATOR . 'manifest.json', '{');
