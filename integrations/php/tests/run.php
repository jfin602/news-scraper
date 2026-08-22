<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use NewsScraper\Integration\Php\ClientConfiguration;
use NewsScraper\Integration\Php\DistributionClient;
use NewsScraper\Integration\Php\DistributionOutcome;
use NewsScraper\Integration\Php\DistributionPage;
use NewsScraper\Integration\Php\DistributionPageClient;
use NewsScraper\Integration\Php\DistributionProfile;
use NewsScraper\Integration\Php\DistributionPublication;
use NewsScraper\Integration\Php\DistributionArticle;
use NewsScraper\Integration\Php\DistributionSource;
use NewsScraper\Integration\Php\ProfileActivation;
use NewsScraper\Integration\Php\ProfileLock;
use NewsScraper\Integration\Php\ProfileLockLease;
use NewsScraper\Integration\Php\ProfileSynchronizationStore;
use NewsScraper\Integration\Php\ProfileSynchronizer;
use NewsScraper\Integration\Php\LocalProfileState;
use NewsScraper\Integration\Php\ActiveProfileSnapshot;
use NewsScraper\Integration\Php\SynchronizationClock;
use NewsScraper\Integration\Php\SynchronizationFacts;
use NewsScraper\Integration\Php\SynchronizationSleeper;
use NewsScraper\Integration\Php\SynchronizerConfiguration;
use NewsScraper\Integration\Php\SynchronizationResult;
use NewsScraper\Integration\Php\UnchangedSynchronization;
use NewsScraper\Integration\Php\HttpRequest;
use NewsScraper\Integration\Php\HttpResponse;
use NewsScraper\Integration\Php\HttpTransport;

$tests = [];

function testCase(string $name, callable $test): void
{
    global $tests;
    $tests[] = [$name, $test];
}

function failTest(string $message): never
{
    throw new RuntimeException($message);
}

function same(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        failTest($message . ' (expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . ')');
    }
}

function trueValue(bool $condition, string $message): void
{
    if (!$condition) {
        failTest($message);
    }
}

function expectInvalidConfiguration(string $url): void
{
    try {
        new ClientConfiguration($url, 'runtime-secret');
    } catch (InvalidArgumentException) {
        return;
    }
    failTest('configuration was accepted: ' . $url);
}

function pagePayload(): array
{
    return [
        'apiVersion' => 'v1',
        'generatedAt' => '2026-08-21T15:00:00.123Z',
        'snapshotRevision' => 'opaque-revision-17',
        'profile' => ['configKey' => 'weekly-desk', 'displayName' => 'Weekly Desk'],
        'publication' => ['name' => 'Example Publication'],
        'items' => [
            [
                'articleId' => 'article-2',
                'headline' => 'Second headline',
                'originalUrl' => 'https://publisher.example/second?x=1&y=2',
                'effectiveFeedDate' => '2026-08-21T14:00:00+00:00',
                'feedDateSource' => 'published_at',
                'publishedAt' => null,
                'author' => null,
                'summary' => 'Second summary',
                'imageUrl' => null,
                'source' => ['configKey' => 'publisher', 'displayName' => 'Publisher'],
                'categories' => [],
            ],
            [
                'articleId' => 'article-1',
                'headline' => 'First headline',
                'originalUrl' => 'https://publisher.example/first',
                'effectiveFeedDate' => '2026-08-20T14:00:00.000Z',
                'feedDateSource' => 'source_updated_at',
                'publishedAt' => '2026-08-20T13:00:00-05:00',
                'author' => 'Author',
                'summary' => null,
                'imageUrl' => 'https://publisher.example/image.jpg',
                'source' => ['configKey' => 'publisher', 'displayName' => 'Publisher'],
                'categories' => [['configKey' => 'news', 'displayName' => 'News']],
            ],
        ],
        'nextCursor' => null,
        'futureField' => ['new' => 'additive'],
    ];
}

function jsonResponse(int $status, array|string $body, array $headers = []): HttpResponse
{
    return new HttpResponse(
        $status,
        $headers,
        is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body,
    );
}

final class ScriptedTransport implements HttpTransport
{
    /** @var array<int, HttpResponse|Throwable> */
    private array $script;

    /** @var array<int, HttpRequest> */
    public array $requests = [];

    /** @param array<int, HttpResponse|Throwable> $script */
    public function __construct(array $script)
    {
        $this->script = $script;
    }

    public function send(HttpRequest $request): HttpResponse
    {
        $this->requests[] = $request;
        $next = array_shift($this->script);
        if ($next instanceof Throwable) {
            throw $next;
        }
        if (!$next instanceof HttpResponse) {
            throw new RuntimeException('script exhausted');
        }
        return $next;
    }
}

function clientFor(HttpResponse|Throwable $response, ?ScriptedTransport &$transport = null): DistributionClient
{
    $transport = new ScriptedTransport([$response]);
    return new DistributionClient(
        new ClientConfiguration('https://api.example.test/', 'runtime-secret'),
        $transport,
    );
}

testCase('configuration enforces HTTPS origin safety and bounded values', static function (): void {
    foreach (['http://api.example.test', 'https://user:pass@api.example.test', 'https://api.example.test?x=1', 'https://api.example.test#fragment'] as $url) {
        expectInvalidConfiguration($url);
    }
    new ClientConfiguration('https://api.example.test', 'runtime-secret', 1, 1_024);
});

testCase('request construction is profile-addressed and cursor-only', static function (): void {
    $transport = null;
    $client = clientFor(jsonResponse(200, pagePayload()), $transport);
    $client->fetchPage('weekly desk/edition');
    same('https://api.example.test/api/v1/distribution/weekly%20desk%2Fedition', $transport->requests[0]->url, 'initial URL');
    same('Bearer runtime-secret', $transport->requests[0]->headers['Authorization'], 'bearer header');
    same(false, $transport->requests[0]->followRedirects, 'redirect following disabled');

    $transport = new ScriptedTransport([jsonResponse(200, pagePayload())]);
    $client = new DistributionClient(new ClientConfiguration('https://api.example.test', 'runtime-secret'), $transport);
    $client->fetchPage('weekly-desk', 'opaque cursor+/=');
    same('https://api.example.test/api/v1/distribution/weekly-desk?cursor=opaque%20cursor%2B%2F%3D', $transport->requests[0]->url, 'continuation URL');
    trueValue(!array_key_exists('If-None-Match', $transport->requests[0]->headers), 'continuation has no conditional header');
});

testCase('valid pages preserve nullable fields, additive fields, order, and exact destinations', static function (): void {
    $transport = null;
    $outcome = clientFor(jsonResponse(200, pagePayload(), ['ETag' => 'opaque-etag']), $transport)->fetchPage('weekly-desk');
    same(DistributionOutcome::SUCCESS, $outcome->kind, 'success outcome');
    same('opaque-etag', $outcome->page->etag, 'opaque ETag');
    same('article-2', $outcome->page->items[0]->articleId, 'received order');
    same('article-1', $outcome->page->items[1]->articleId, 'received order');
    same('https://publisher.example/second?x=1&y=2', $outcome->page->items[0]->originalUrl, 'exact original URL');
    same(null, $outcome->page->items[0]->publishedAt, 'nullable publishedAt');
    same([], $outcome->page->items[0]->categories, 'empty categories');
    same('opaque-revision-17', $outcome->page->snapshotRevision, 'opaque snapshot revision');
    trueValue(!str_contains(serialize($outcome), 'runtime-secret'), 'credential absent from result');

    $withCursor = pagePayload();
    $withCursor['nextCursor'] = 'opaque-next-cursor';
    $cursorOutcome = clientFor(jsonResponse(200, $withCursor))->fetchPage('weekly-desk');
    same('opaque-next-cursor', $cursorOutcome->page->nextCursor, 'opaque continuation output');
});

testCase('schema, API version, profile, timestamp, and JSON failures are bounded', static function (): void {
    $cases = [];
    $missing = pagePayload();
    unset($missing['items']);
    $cases[] = $missing;
    $wrongType = pagePayload();
    $wrongType['items'] = 'not-an-array';
    $cases[] = $wrongType;
    $wrongItemType = pagePayload();
    $wrongItemType['items'][0]['originalUrl'] = ['not', 'a', 'string'];
    $cases[] = $wrongItemType;
    $wrongNullableType = pagePayload();
    $wrongNullableType['items'][0]['author'] = ['not', 'nullable', 'text'];
    $cases[] = $wrongNullableType;
    $wrongVersion = pagePayload();
    $wrongVersion['apiVersion'] = 'v2';
    $cases[] = $wrongVersion;
    $wrongProfile = pagePayload();
    $wrongProfile['profile']['configKey'] = 'other-profile';
    $cases[] = $wrongProfile;
    $wrongTimestamp = pagePayload();
    $wrongTimestamp['generatedAt'] = 'not-a-timestamp';
    $cases[] = $wrongTimestamp;
    foreach ($cases as $payload) {
        same(DistributionOutcome::INVALID_RESPONSE, clientFor(jsonResponse(200, $payload))->fetchPage('weekly-desk')->kind, 'invalid page rejected');
    }
    same(DistributionOutcome::INVALID_RESPONSE, clientFor(jsonResponse(200, '{not-json'))->fetchPage('weekly-desk')->kind, 'invalid JSON rejected');
});

testCase('conditional initial requests capture ETag and accept only bodyless initial 304', static function (): void {
    $transport = new ScriptedTransport([jsonResponse(304, '', ['ETag' => 'opaque-etag'])]);
    $client = new DistributionClient(new ClientConfiguration('https://api.example.test', 'runtime-secret'), $transport);
    $outcome = $client->fetchPage('weekly-desk', null, 'opaque-etag');
    same(DistributionOutcome::NOT_MODIFIED, $outcome->kind, 'not modified outcome');
    same('opaque-etag', $outcome->etag, '304 ETag');
    same('opaque-etag', $transport->requests[0]->headers['If-None-Match'], 'conditional header');

    same(DistributionOutcome::INVALID_RESPONSE, clientFor(jsonResponse(304, ''))->fetchPage('weekly-desk')->kind, 'unconditional 304 rejected');
    same(DistributionOutcome::INVALID_REQUEST, clientFor(jsonResponse(304, ''))->fetchPage('weekly-desk', 'cursor', 'etag')->kind, 'continuation conditional input rejected');
    same(DistributionOutcome::INVALID_RESPONSE, clientFor(jsonResponse(304, '{}'))->fetchPage('weekly-desk', null, 'etag')->kind, '304 body rejected');
});

testCase('documented error statuses map to typed outcomes without raw details', static function (): void {
    $statusCases = [
        [400, 'invalid_request', DistributionOutcome::INVALID_REQUEST],
        [401, 'unauthenticated', DistributionOutcome::UNAUTHENTICATED],
        [404, 'not_found', DistributionOutcome::NOT_FOUND],
        [409, 'profile_disabled', DistributionOutcome::PROFILE_DISABLED],
        [409, 'snapshot_changed', DistributionOutcome::SNAPSHOT_CHANGED],
        [503, 'service_unavailable', DistributionOutcome::SERVICE_UNAVAILABLE],
    ];
    foreach ($statusCases as [$status, $error, $expected]) {
        same($expected, clientFor(jsonResponse($status, ['error' => $error]))->fetchPage('weekly-desk')->kind, 'status mapping');
    }
    $transport = null;
    $outcome = clientFor(jsonResponse(429, ['error' => 'rate_limited'], ['Retry-After' => '37']), $transport)->fetchPage('weekly-desk');
    same(DistributionOutcome::RATE_LIMITED, $outcome->kind, 'rate limit mapping');
    same(37, $outcome->retryAfterSeconds, 'Retry-After seconds');
    same(DistributionOutcome::INVALID_RESPONSE, clientFor(jsonResponse(429, ['error' => 'rate_limited']))->fetchPage('weekly-desk')->kind, 'missing Retry-After rejected');
    same(DistributionOutcome::INVALID_RESPONSE, clientFor(jsonResponse(429, ['error' => 'rate_limited'], ['Retry-After' => '0']))->fetchPage('weekly-desk')->kind, 'non-positive Retry-After rejected');
});

testCase('redirects, unexpected statuses, and transport failures do not leak credentials or body data', static function (): void {
    $token = 'runtime-secret';
    $redirectTransport = null;
    $redirect = clientFor(new HttpResponse(302, ['Location' => 'https://other.example'], $token), $redirectTransport);
    $redirectOutcome = $redirect->fetchPage('weekly-desk');
    same(DistributionOutcome::INVALID_RESPONSE, $redirectOutcome->kind, 'redirect rejected');
    same(false, $redirectTransport->requests[0]->followRedirects, 'redirect not followed');
    trueValue(!str_contains(serialize($redirectOutcome), $token), 'redirect body not leaked');

    $transport = null;
    $failure = clientFor(new RuntimeException('failure ' . $token), $transport)->fetchPage('weekly-desk');
    same(DistributionOutcome::TRANSPORT_FAILURE, $failure->kind, 'transport failure bounded');
    trueValue(!str_contains(serialize($failure), $token), 'transport detail not leaked');
});

final class ScriptedPageClient implements DistributionPageClient
{
    /** @var array<int, DistributionOutcome|Throwable> */
    private array $script;

    /** @var array<int, array{profileKey: string, cursor: ?string, etag: ?string}> */
    public array $requests = [];

    /** @param array<int, DistributionOutcome|Throwable> $script */
    public function __construct(array $script)
    {
        $this->script = $script;
    }

    public function fetchPage(string $profileKey, ?string $cursor = null, ?string $activeEtag = null): DistributionOutcome
    {
        $this->requests[] = ['profileKey' => $profileKey, 'cursor' => $cursor, 'etag' => $activeEtag];
        $next = array_shift($this->script);
        if ($next instanceof Throwable) {
            throw $next;
        }
        if (!$next instanceof DistributionOutcome) {
            throw new RuntimeException('page script exhausted');
        }
        return $next;
    }
}

final class FakeClock implements SynchronizationClock
{
    public function __construct(private readonly DateTimeImmutable $time = new DateTimeImmutable('2026-08-21T15:00:00+00:00'))
    {
    }

    public function now(): DateTimeImmutable
    {
        return $this->time;
    }
}

final class FakeSleeper implements SynchronizationSleeper
{
    /** @var array<int, int> */
    public array $delays = [];

    public function sleep(int $seconds): void
    {
        $this->delays[] = $seconds;
    }
}

final class FakeLease implements ProfileLockLease
{
    public int $releases = 0;

    public function __construct(private readonly bool $throwOnRelease = false)
    {
    }

    public function release(): void
    {
        $this->releases++;
        if ($this->throwOnRelease) {
            throw new RuntimeException('release failure');
        }
    }
}

final class FakeProfileLock implements ProfileLock
{
    /** @var array<string, bool> */
    public array $available = [];

    /** @var array<string, FakeLease> */
    public array $leases = [];

    /** @var array<int, string> */
    public array $attempts = [];

    public bool $throwOnAcquire = false;

    public function tryAcquire(string $profileKey): ?ProfileLockLease
    {
        $this->attempts[] = $profileKey;
        if ($this->throwOnAcquire) {
            throw new RuntimeException('lock failure');
        }
        if (($this->available[$profileKey] ?? true) === false) {
            return null;
        }
        return $this->leases[$profileKey] ??= new FakeLease();
    }
}

final class FakeSynchronizationStore implements ProfileSynchronizationStore
{
    /** @var array<string, LocalProfileState> */
    public array $states = [];

    /** @var array<int, ProfileActivation> */
    public array $activations = [];

    /** @var array<int, UnchangedSynchronization> */
    public array $unchanged = [];

    /** @var array<int, SynchronizationFacts> */
    public array $disabledFacts = [];

    /** @var array<int, SynchronizationFacts> */
    public array $failureFacts = [];

    public bool $throwOnLoad = false;
    public bool $throwOnActivate = false;
    public bool $throwOnDisabled = false;

    /** @param array<int, LocalProfileState> $states */
    public function __construct(array $states = [])
    {
        foreach ($states as $state) {
            $this->states[$state->profileKey] = $state;
        }
    }

    public function load(string $profileKey): LocalProfileState
    {
        if ($this->throwOnLoad) {
            throw new RuntimeException('load failure');
        }
        return $this->states[$profileKey] ?? new LocalProfileState($profileKey, null, false, null);
    }

    public function activate(ProfileActivation $activation): void
    {
        if ($this->throwOnActivate) {
            throw new RuntimeException('activation failure');
        }
        $this->activations[] = $activation;
        $this->states[$activation->profileKey] = new LocalProfileState(
            $activation->profileKey,
            new ActiveProfileSnapshot(
                $activation->profileKey,
                $activation->profile,
                $activation->publication,
                $activation->apiVersion,
                $activation->snapshotRevision,
                $activation->etag,
                $activation->generatedAt,
                $activation->items,
            ),
            false,
            $activation->facts->lastSuccessfulSyncAt,
        );
    }

    public function recordUnchanged(UnchangedSynchronization $unchanged): void
    {
        $this->unchanged[] = $unchanged;
        $state = $this->load($unchanged->profileKey);
        if ($state->active === null) {
            throw new RuntimeException('missing active snapshot');
        }
        $active = $state->active;
        $this->states[$unchanged->profileKey] = new LocalProfileState(
            $unchanged->profileKey,
            new ActiveProfileSnapshot($active->profileKey, $active->profile, $active->publication, $active->apiVersion, $active->snapshotRevision, $unchanged->etag, $active->generatedAt, $active->items),
            false,
            $unchanged->facts->lastSuccessfulSyncAt,
        );
    }

    public function markDisabled(string $profileKey, SynchronizationFacts $facts): void
    {
        if ($this->throwOnDisabled) {
            throw new RuntimeException('disabled persistence failure');
        }
        $this->disabledFacts[] = $facts;
        $state = $this->load($profileKey);
        $this->states[$profileKey] = new LocalProfileState($profileKey, $state->active, true, $state->lastSuccessfulSyncAt);
    }

    public function recordFailure(string $profileKey, SynchronizationFacts $facts): void
    {
        $this->failureFacts[] = $facts;
    }
}

function syncArticle(string $id): DistributionArticle
{
    return new DistributionArticle($id, 'Headline ' . $id, 'https://publisher.example/' . $id, '2026-08-21T14:00:00Z', 'published_at', null, null, null, null, new DistributionSource('publisher', 'Publisher'), []);
}

/** @param array<int, DistributionArticle> $items */
function syncPage(array $items, ?string $nextCursor = null, string $revision = 'revision-1', string $profileName = 'Weekly Desk', string $publicationName = 'Example Publication', string $apiVersion = 'v1', ?string $etag = 'etag-1'): DistributionPage
{
    return new DistributionPage($apiVersion, '2026-08-21T15:00:00Z', $revision, new DistributionProfile('weekly-desk', $profileName), new DistributionPublication($publicationName), $items, $nextCursor, $etag);
}

/** @param array<int, DistributionArticle> $items */
function syncPageFor(string $profileKey, array $items, ?string $nextCursor = null, string $revision = 'revision-1'): DistributionPage
{
    return new DistributionPage('v1', '2026-08-21T15:00:00Z', $revision, new DistributionProfile($profileKey, 'Profile ' . $profileKey), new DistributionPublication('Example Publication'), $items, $nextCursor, 'etag-' . $profileKey);
}

function successfulPage(DistributionPage $page): DistributionOutcome
{
    return new DistributionOutcome(DistributionOutcome::SUCCESS, $page, $page->etag);
}

function activeState(string $profileKey = 'weekly-desk', bool $disabled = false): LocalProfileState
{
    $page = $profileKey === 'weekly-desk'
        ? syncPage([syncArticle('old')], null, 'old-revision', 'Weekly Desk', 'Example Publication', 'v1', 'old-etag')
        : syncPageFor($profileKey, [syncArticle('old')], null, 'old-revision');
    return new LocalProfileState($profileKey, new ActiveProfileSnapshot($profileKey, $page->profile, $page->publication, $page->apiVersion, $page->snapshotRevision, $page->etag, $page->generatedAt, $page->items), $disabled, new DateTimeImmutable('2026-08-20T15:00:00+00:00'));
}

function synchronizerFor(ScriptedPageClient $client, FakeSynchronizationStore $store, FakeProfileLock $lock, ?FakeSleeper &$sleeper = null, ?SynchronizerConfiguration $configuration = null): ProfileSynchronizer
{
    $sleeper = new FakeSleeper();
    return new ProfileSynchronizer($client, $store, $lock, new FakeClock(), $sleeper, $configuration ?? new SynchronizerConfiguration());
}

testCase('synchronizer commits complete one-page, multi-page, and empty candidates in upstream order', static function (): void {
    $store = new FakeSynchronizationStore();
    $lock = new FakeProfileLock();
    $client = new ScriptedPageClient([successfulPage(syncPage([syncArticle('two'), syncArticle('one')]))]);
    $result = synchronizerFor($client, $store, $lock)->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'one-page success');
    same(1, count($store->activations), 'one activation');
    same('two', $store->activations[0]->items[0]->articleId, 'exact first item order');
    same('one', $store->activations[0]->items[1]->articleId, 'exact second item order');

    $store = new FakeSynchronizationStore();
    $lock = new FakeProfileLock();
    $client = new ScriptedPageClient([
        successfulPage(syncPage([syncArticle('first')], 'cursor-two')),
        successfulPage(syncPage([syncArticle('second')], null)),
    ]);
    $result = synchronizerFor($client, $store, $lock)->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'multi-page success');
    same('cursor-two', $client->requests[1]['cursor'], 'continuation uses supplied opaque cursor');
    same(null, $client->requests[1]['etag'], 'continuation is not conditional');
    same(['first', 'second'], array_map(static fn (DistributionArticle $article): string => $article->articleId, $store->activations[0]->items), 'combined item order');
    same(2, $store->activations[0]->facts->pageCount, 'complete page count');
    trueValue(!str_contains(serialize($store->activations[0]), 'cursor-two'), 'activation excludes cursor internals');

    $store = new FakeSynchronizationStore();
    $client = new ScriptedPageClient([successfulPage(syncPage([]))]);
    $result = synchronizerFor($client, $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'empty Profile activates');
    same([], $store->activations[0]->items, 'empty payload remains a valid snapshot');
});

testCase('synchronizer uses active ETag and 304 preserves active payload while clearing disabled state', static function (): void {
    $store = new FakeSynchronizationStore([activeState('weekly-desk', true)]);
    $client = new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::NOT_MODIFIED, null, 'replacement-etag')]);
    $result = synchronizerFor($client, $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::UNCHANGED, $result->facts->outcome, '304 is unchanged success');
    same('old-etag', $client->requests[0]['etag'], 'initial request supplies active ETag');
    same(0, count($store->activations), '304 does not replace active payload');
    same('old-revision', $store->states['weekly-desk']->active->snapshotRevision, '304 preserves revision');
    same('old', $store->states['weekly-desk']->active->items[0]->articleId, '304 preserves item payload');
    same(false, $store->states['weekly-desk']->disabled, '304 re-enables cached state');

    $store = new FakeSynchronizationStore();
    $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::NOT_MODIFIED)]), $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::FAILED, $result->facts->outcome, '304 without active fails');
    same('not_modified_without_active', $result->facts->failureCategory, '304 failure category');
});

testCase('mixed, looping, bounded, and partial candidates preserve active state', static function (): void {
    $cases = [
        [
            [successfulPage(syncPageFor('other-profile', [syncArticle('wrong-profile')]))],
            new SynchronizerConfiguration(),
            'candidate_identity_mismatch',
        ],
        [
            [successfulPage(syncPage([syncArticle('new')], 'next')), successfulPage(syncPage([syncArticle('other')], null, 'revision-2'))],
            new SynchronizerConfiguration(),
            'candidate_identity_mismatch',
        ],
        [
            [successfulPage(syncPage([syncArticle('new')], 'next')), successfulPage(syncPage([syncArticle('other')], null, 'revision-1', 'Weekly Desk', 'Example Publication', 'v2'))],
            new SynchronizerConfiguration(),
            'candidate_identity_mismatch',
        ],
        [
            [successfulPage(syncPage([syncArticle('new')], 'same')), successfulPage(syncPage([syncArticle('other')], 'same'))],
            new SynchronizerConfiguration(),
            'cursor_loop',
        ],
        [
            [successfulPage(syncPage([syncArticle('new')], 'next')), successfulPage(syncPage([syncArticle('other')], null))],
            new SynchronizerConfiguration(maximumPages: 1),
            'candidate_page_limit_exceeded',
        ],
        [
            [successfulPage(syncPage([syncArticle('new')], 'next')), new DistributionOutcome(DistributionOutcome::INVALID_RESPONSE)],
            new SynchronizerConfiguration(),
            'invalid_upstream_response',
        ],
    ];
    $sleeper = null;
    foreach ($cases as [$script, $configuration, $category]) {
        $store = new FakeSynchronizationStore([activeState()]);
        $result = synchronizerFor(new ScriptedPageClient($script), $store, new FakeProfileLock(), $sleeper, $configuration)->synchronize('weekly-desk');
        same(SynchronizationResult::FAILED, $result->facts->outcome, 'candidate failure result');
        same($category, $result->facts->failureCategory, 'candidate failure category');
        same('old', $store->states['weekly-desk']->active->items[0]->articleId, 'prior active retained');
        same(0, count($store->activations), 'partial candidate never activates');
    }
});

testCase('synchronizer retries only transient requests with bounded backoff and exact Retry-After', static function (): void {
    $store = new FakeSynchronizationStore([activeState()]);
    $sleeper = null;
    $client = new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::TRANSPORT_FAILURE), new DistributionOutcome(DistributionOutcome::SERVICE_UNAVAILABLE), successfulPage(syncPage([syncArticle('new')]))]);
    $result = synchronizerFor($client, $store, new FakeProfileLock(), $sleeper)->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'transient retry succeeds');
    same([1, 2], $sleeper->delays, 'bounded exponential retry delays');

    $store = new FakeSynchronizationStore([activeState()]);
    $sleeper = null;
    $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::RATE_LIMITED, null, null, 37), successfulPage(syncPage([syncArticle('new')]))]), $store, new FakeProfileLock(), $sleeper)->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'rate retry succeeds');
    same([37], $sleeper->delays, 'validated Retry-After used exactly');

    $store = new FakeSynchronizationStore([activeState()]);
    $sleeper = null;
    $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::RATE_LIMITED, null, null, 61)]), $store, new FakeProfileLock(), $sleeper)->synchronize('weekly-desk');
    same('retry_after_exceeds_maximum', $result->facts->failureCategory, 'oversized Retry-After ends safely');
    same([], $sleeper->delays, 'oversized Retry-After is not shortened');

    $store = new FakeSynchronizationStore([activeState()]);
    $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::SERVICE_UNAVAILABLE), new DistributionOutcome(DistributionOutcome::SERVICE_UNAVAILABLE), new DistributionOutcome(DistributionOutcome::SERVICE_UNAVAILABLE)]), $store, new FakeProfileLock())->synchronize('weekly-desk');
    same('retry_exhausted', $result->facts->failureCategory, 'finite retry exhaustion');
    same('old', $store->states['weekly-desk']->active->items[0]->articleId, 'retry exhaustion preserves active');
});

testCase('terminal authenticated and malformed failures do not suppress active state', static function (): void {
    foreach ([DistributionOutcome::UNAUTHENTICATED, DistributionOutcome::INVALID_REQUEST, DistributionOutcome::NOT_FOUND, DistributionOutcome::INVALID_RESPONSE] as $kind) {
        $store = new FakeSynchronizationStore([activeState()]);
        $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome($kind)]), $store, new FakeProfileLock())->synchronize('weekly-desk');
        same(SynchronizationResult::FAILED, $result->facts->outcome, 'terminal failure result');
        same(false, $store->states['weekly-desk']->disabled, 'only profile_disabled may suppress active');
        same('old', $store->states['weekly-desk']->active->items[0]->articleId, 'terminal failure retains active');
    }
});

testCase('snapshot changes discard candidates and restart only within the configured budget', static function (): void {
    $store = new FakeSynchronizationStore([activeState()]);
    $client = new ScriptedPageClient([
        successfulPage(syncPage([syncArticle('discard')], 'cursor-old')),
        new DistributionOutcome(DistributionOutcome::SNAPSHOT_CHANGED),
        successfulPage(syncPage([syncArticle('fresh')], null, 'revision-2')),
    ]);
    $result = synchronizerFor($client, $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'one snapshot change restarts');
    same([null, 'cursor-old', null], array_map(static fn (array $request): ?string => $request['cursor'], $client->requests), 'restart begins with a fresh initial request');
    same('fresh', $store->activations[0]->items[0]->articleId, 'discarded candidate never splices into fresh candidate');
    same('news-scraper-php', $result->facts->adapterVersion, 'bounded adapter version fact');

    $store = new FakeSynchronizationStore([activeState()]);
    $client = new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::SNAPSHOT_CHANGED), new DistributionOutcome(DistributionOutcome::SNAPSHOT_CHANGED)]);
    $result = synchronizerFor($client, $store, new FakeProfileLock(), $sleeper, new SynchronizerConfiguration(maxSnapshotRestarts: 1))->synchronize('weekly-desk');
    same('snapshot_restart_exhausted', $result->facts->failureCategory, 'restarts have a separate finite budget');
    same(0, count($store->activations), 'repeated snapshot change retains active');
});

testCase('profile disable is authoritative, re-enable follows successful sync, and persistence failure is safe', static function (): void {
    $store = new FakeSynchronizationStore([activeState()]);
    $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::PROFILE_DISABLED)]), $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::DISABLED, $result->facts->outcome, 'authenticated disable is authoritative');
    same(true, $store->states['weekly-desk']->disabled, 'disabled marker stored');
    same('old', $store->states['weekly-desk']->active->items[0]->articleId, 'disabled retains recoverable payload');

    $result = synchronizerFor(new ScriptedPageClient([successfulPage(syncPage([syncArticle('restored')]))]), $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'later success re-enables');
    same(false, $store->states['weekly-desk']->disabled, 'activation clears disabled state');

    $store = new FakeSynchronizationStore([activeState()]);
    $store->throwOnDisabled = true;
    $result = synchronizerFor(new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::PROFILE_DISABLED)]), $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::FAILED, $result->facts->outcome, 'disable persistence failure is not reported as suppression');
    same('local_persistence_failure', $result->facts->failureCategory, 'disable persistence failure is safe');
});

testCase('activation, locking, result facts, and Profile state are independently safe', static function (): void {
    $store = new FakeSynchronizationStore([activeState()]);
    $store->throwOnActivate = true;
    $lock = new FakeProfileLock();
    $result = synchronizerFor(new ScriptedPageClient([successfulPage(syncPage([syncArticle('new')]))]), $store, $lock)->synchronize('weekly-desk');
    same('activation_failed', $result->facts->failureCategory, 'activation failure is surfaced');
    same('old', $store->states['weekly-desk']->active->items[0]->articleId, 'activation failure leaves prior active intact');
    same(1, $lock->leases['weekly-desk']->releases, 'lock releases after activation failure');

    $store = new FakeSynchronizationStore();
    $store->throwOnLoad = true;
    $lock = new FakeProfileLock();
    $result = synchronizerFor(new ScriptedPageClient([]), $store, $lock)->synchronize('weekly-desk');
    same('local_persistence_failure', $result->facts->failureCategory, 'load failure is bounded');
    same(1, $lock->leases['weekly-desk']->releases, 'lock releases after local exception');

    $store = new FakeSynchronizationStore([activeState('weekly-desk'), activeState('other-profile')]);
    $lock = new FakeProfileLock();
    $lock->available['weekly-desk'] = false;
    $client = new ScriptedPageClient([successfulPage(syncPageFor('other-profile', [syncArticle('other')]))]);
    $synchronizer = synchronizerFor($client, $store, $lock);
    $overlap = $synchronizer->synchronize('weekly-desk');
    same(SynchronizationResult::ALREADY_RUNNING, $overlap->facts->outcome, 'lock contention is bounded');
    same([], $client->requests, 'overlap performs no remote request');
    same([], $store->failureFacts, 'overlap performs no state write');
    $other = $synchronizer->synchronize('other-profile');
    same(SynchronizationResult::SUCCESS, $other->facts->outcome, 'different Profile is independent');
    same(1, $lock->leases['other-profile']->releases, 'successful lock releases');
    trueValue(!str_contains(serialize($store->activations[0]), 'runtime-secret'), 'activation excludes credentials');
    trueValue(!str_contains(serialize($other->facts), 'cursor'), 'health facts exclude cursor values');
});

if (count($tests) === 0) {
    fwrite(STDERR, "PHP test runner discovered zero substantive tests.\n");
    exit(1);
}

$passed = 0;
foreach ($tests as [$name, $test]) {
    try {
        $test();
        $passed++;
        fwrite(STDOUT, "ok - {$name}\n");
    } catch (Throwable $error) {
        fwrite(STDERR, "not ok - {$name}: {$error->getMessage()}\n");
        exit(1);
    }
}
fwrite(STDOUT, "PHP tests: {$passed} passed\n");
