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
use NewsScraper\Integration\Php\DistributionCategory;
use NewsScraper\Integration\Php\DistributionDigest;
use NewsScraper\Integration\Php\DistributionDigestHighlight;
use NewsScraper\Integration\Php\DistributionDigestSupport;
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
use NewsScraper\Integration\Php\FilesystemProfileStateStore;
use NewsScraper\Integration\Php\FilesystemProfileLock;
use NewsScraper\Integration\Php\LocalFilesystem;
use NewsScraper\Integration\Php\NativeLocalFilesystem;
use NewsScraper\Integration\Php\NativeHttpTransport;
use NewsScraper\Integration\Php\TransportFailure;
use NewsScraper\Integration\Php\LocalProfileUsabilityResolver;
use NewsScraper\Integration\Php\LocalProfileUsability;
use NewsScraper\Integration\Php\IntegrationRuntimeConfiguration;
use NewsScraper\Integration\Php\ProfileCadence;
use NewsScraper\Integration\Php\LocalReadConfiguration;
use NewsScraper\Integration\Php\LocalProfileReader;
use NewsScraper\Integration\Php\LocalReadResult;
use NewsScraper\Integration\Php\LocalReadArticle;
use NewsScraper\Integration\Php\LocalReadProfile;
use NewsScraper\Integration\Php\LocalReadPublication;
use NewsScraper\Integration\Php\LocalReadSource;
use NewsScraper\Integration\Php\LocalReadHealth;
use NewsScraper\Integration\Php\EnvironmentFileLoader;
use NewsScraper\Integration\Php\IntegrationConfigurationLoader;
use NewsScraper\Integration\Php\PackageMetadataException;
use NewsScraper\Integration\Php\PackageMetadataReader;
use NewsScraper\Integration\Php\PackagePreflight;

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

function digestPayload(string $freshness = 'current', string $overview = 'Bounded overview.'): array
{
    return [
        'generatedAt' => '2026-08-21T14:30:00.000Z',
        'freshness' => $freshness,
        'inputArticleCount' => 2,
        'provider' => 'gemini',
        'model' => 'gemini-3.7-flash',
        'overview' => $overview,
        'highlights' => [[
            'title' => 'A development',
            'explanation' => 'A bounded explanation.',
            'supportingArticles' => [[
                'articleId' => 'article-2',
                'headline' => 'Second headline',
                'source' => ['displayName' => 'Publisher'],
                'effectiveFeedDate' => '2026-08-21T14:00:00+00:00',
                'originalUrl' => 'https://publisher.example/second?x=1&y=2',
            ]],
        ]],
    ];
}

function syncDigest(string $overview = 'Bounded overview.'): DistributionDigest
{
    return new DistributionDigest('2026-08-21T14:30:00.000Z', 'current', 2, 'gemini', 'gemini-3.7-flash', $overview, [new DistributionDigestHighlight('A development', 'A bounded explanation.', [new DistributionDigestSupport('article-2', 'Second headline', 'Publisher', '2026-08-21T14:00:00+00:00', 'https://publisher.example/second?x=1&y=2')])]);
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
    $client->fetchPage('weekly/desk?edition');
    same('https://api.example.test/api/v1/distribution/weekly%2Fdesk%3Fedition', $transport->requests[0]->url, 'initial URL');
    same('Bearer runtime-secret', $transport->requests[0]->headers['Authorization'], 'bearer header');
    same(false, $transport->requests[0]->followRedirects, 'redirect following disabled');

    $transport = new ScriptedTransport([jsonResponse(200, pagePayload())]);
    $client = new DistributionClient(new ClientConfiguration('https://api.example.test', 'runtime-secret'), $transport);
    $client->fetchPage('weekly-desk', 'opaque+cursor/=');
    same('https://api.example.test/api/v1/distribution/weekly-desk?cursor=opaque%2Bcursor%2F%3D', $transport->requests[0]->url, 'continuation URL');
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

testCase('optional digest parses independently and malformed optional state fails open', static function (): void {
    foreach (['current', 'older'] as $freshness) {
        $payload = pagePayload();
        $payload['digest'] = digestPayload($freshness);
        $outcome = clientFor(jsonResponse(200, $payload))->fetchPage('weekly-desk');
        same(DistributionOutcome::SUCCESS, $outcome->kind, 'valid digest preserves core page');
        same($freshness, $outcome->page->digest->freshness, 'digest freshness is exact');
        same('https://publisher.example/second?x=1&y=2', $outcome->page->digest->highlights[0]->supportingArticles[0]->originalUrl, 'support destination is exact');
    }
    foreach ([null, 'missing', 'invalid_freshness', 'invalid_count', 'invalid_timestamp', 'invalid_type', 'oversized', 'invalid_support'] as $kind) {
        $payload = pagePayload();
        if ($kind === null) $payload['digest'] = null;
        elseif ($kind !== 'missing') {
            $payload['digest'] = digestPayload();
            if ($kind === 'invalid_freshness') $payload['digest']['freshness'] = 'stale';
            if ($kind === 'invalid_count') $payload['digest']['inputArticleCount'] = 21;
            if ($kind === 'invalid_timestamp') $payload['digest']['generatedAt'] = 'not-a-date';
            if ($kind === 'invalid_type') $payload['digest']['provider'] = ['not', 'text'];
            if ($kind === 'oversized') $payload['digest']['overview'] = str_repeat('x', 2_001);
            if ($kind === 'invalid_support') $payload['digest']['highlights'][0]['supportingArticles'][0]['originalUrl'] = 'not-a-url';
        }
        $outcome = clientFor(jsonResponse(200, $payload))->fetchPage('weekly-desk');
        same(DistributionOutcome::SUCCESS, $outcome->kind, 'optional digest corruption does not invalidate Articles');
        same(null, $outcome->page->digest, 'optional digest corruption normalizes to null');
    }
    $payload = pagePayload();
    $payload['digest'] = digestPayload();
    $payload['digest']['digestInputIdentity'] = 'internal-identity';
    $payload['digest']['attempt'] = ['rawResponse' => 'untrusted'];
    $outcome = clientFor(jsonResponse(200, $payload))->fetchPage('weekly-desk');
    trueValue(!str_contains(serialize($outcome->page->digest), 'internal-identity') && !str_contains(serialize($outcome->page->digest), 'rawResponse'), 'unknown internal digest fields never become DTO data');
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

testCase('native transport handles controlled HTTP responses without following redirects or leaking secrets', static function (): void {
    $listener = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
    if ($listener === false) failTest('could not reserve a loopback test port');
    $address = stream_socket_get_name($listener, false);
    fclose($listener);
    if (!is_string($address)) failTest('could not determine the loopback test port');

    $router = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'news-scraper-php-router-' . bin2hex(random_bytes(8)) . '.php';
    file_put_contents($router, <<<'PHP'
<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/redirect') {
    header('Location: /secret-target', true, 302);
    echo 'redirect';
    return;
}
if ($path === '/secret-target') {
    http_response_code(500);
    echo 'redirect-followed';
    return;
}
if ($path === '/oversized') {
    header('X-Test: bounded');
    echo str_repeat('x', 2048);
    return;
}
http_response_code(429);
header('Retry-After: 17');
header('X-Test: parsed');
echo '{"error":"rate_limited"}';
PHP);

    $process = proc_open([PHP_BINARY, '-S', $address, $router], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
    if (!is_resource($process)) failTest('controlled PHP HTTP server did not start');
    try {
        $ready = false;
        for ($attempt = 0; $attempt < 100; $attempt++) {
            $probe = @stream_socket_client('tcp://' . $address, $probeCode, $probeMessage, 0.05);
            if ($probe !== false) {
                fclose($probe);
                $ready = true;
                break;
            }
            usleep(10_000);
        }
        if (!$ready) failTest('controlled PHP HTTP server was not ready');

        $transport = new NativeHttpTransport();
        $response = $transport->send(new HttpRequest('http://' . $address . '/status', ['Authorization' => 'Bearer synthetic-native-secret'], 2, 1024));
        same(429, $response->status, 'native status is parsed');
        same('17', $response->header('retry-after'), 'native response header is parsed');
        same('{"error":"rate_limited"}', $response->body, 'native body is bounded and returned');

        $redirect = $transport->send(new HttpRequest('http://' . $address . '/redirect', ['Authorization' => 'Bearer synthetic-native-secret'], 2, 1024));
        same(302, $redirect->status, 'native redirect is surfaced rather than followed');
        same('redirect', $redirect->body, 'redirect target was not contacted');

        try {
            $transport->send(new HttpRequest('http://' . $address . '/oversized', ['Authorization' => 'Bearer synthetic-native-secret'], 2, 1024));
            failTest('native response bound was not enforced');
        } catch (TransportFailure $error) {
            trueValue(!str_contains($error->getMessage(), 'synthetic-native-secret'), 'native failure is secret-free');
        }
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
        proc_close($process);
        @unlink($router);
    }
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
                $activation->digest,
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
            new ActiveProfileSnapshot($active->profileKey, $active->profile, $active->publication, $active->apiVersion, $active->snapshotRevision, $unchanged->etag, $active->generatedAt, $active->items, $active->digest),
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
function syncPage(array $items, ?string $nextCursor = null, string $revision = 'revision-1', string $profileName = 'Weekly Desk', string $publicationName = 'Example Publication', string $apiVersion = 'v1', ?string $etag = 'etag-1', ?DistributionDigest $digest = null): DistributionPage
{
    return new DistributionPage($apiVersion, '2026-08-21T15:00:00Z', $revision, new DistributionProfile('weekly-desk', $profileName), new DistributionPublication($publicationName), $items, $nextCursor, $etag, $digest);
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

/** @param array<int, DistributionArticle> $items */
function localReadActivation(DateTimeImmutable $at, array $items): ProfileActivation
{
    $page = syncPage($items, null, 'local-revision', 'Weekly Desk', 'Example Publication', 'v1', 'local-etag');
    $facts = new SynchronizationFacts('weekly-desk', SynchronizationResult::SUCCESS, $at, $at, 1.25, count($items), 1, false, null, $at, 'news-scraper-php');
    return new ProfileActivation('weekly-desk', $page->profile, $page->publication, $page->apiVersion, $page->snapshotRevision, $page->etag, $page->generatedAt, $page->items, $facts);
}

function localReadConfiguration(string $root, ?int $maximumStaleAgeSeconds = null): LocalReadConfiguration
{
    return new LocalReadConfiguration('weekly-desk', $root, 900, $maximumStaleAgeSeconds);
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

testCase('candidate digest requires every continuation page to carry the same valid digest', static function (): void {
    $digest = syncDigest();
    $store = new FakeSynchronizationStore();
    $client = new ScriptedPageClient([successfulPage(syncPage([syncArticle('one')], 'cursor-two', digest: $digest)), successfulPage(syncPage([syncArticle('two')], null, digest: $digest))]);
    $result = synchronizerFor($client, $store, new FakeProfileLock())->synchronize('weekly-desk');
    same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'coherent digest candidate activates');
    same('Bounded overview.', $store->activations[0]->digest->overview, 'coherent digest is activated');

    foreach ([null, syncDigest('Different overview.')] as $continuationDigest) {
        $store = new FakeSynchronizationStore();
        $client = new ScriptedPageClient([successfulPage(syncPage([syncArticle('one')], 'cursor-two', digest: $digest)), successfulPage(syncPage([syncArticle('two')], null, digest: $continuationDigest))]);
        $result = synchronizerFor($client, $store, new FakeProfileLock())->synchronize('weekly-desk');
        same(SynchronizationResult::SUCCESS, $result->facts->outcome, 'optional digest mismatch preserves Article activation');
        same(null, $store->activations[0]->digest, 'incoherent digest normalizes to null');
        same(['one', 'two'], array_map(static fn (DistributionArticle $article): string => $article->articleId, $store->activations[0]->items), 'Article candidate remains complete');
    }
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

final class FaultInjectingFilesystem implements LocalFilesystem
{
    public ?string $failWriteContaining = null;
    public ?string $failRenameContaining = null;
    private NativeLocalFilesystem $native;
    public function __construct() { $this->native = new NativeLocalFilesystem(); }
    public function writeExclusive(string $path, string $contents): void { if ($this->failWriteContaining !== null && str_contains($path, $this->failWriteContaining)) throw new RuntimeException('injected write failure'); $this->native->writeExclusive($path, $contents); }
    public function rename(string $from, string $to): void { if ($this->failRenameContaining !== null && str_contains($to, $this->failRenameContaining)) throw new RuntimeException('injected rename failure'); $this->native->rename($from, $to); }
    public function read(string $path): string { return $this->native->read($path); }
    public function exists(string $path): bool { return $this->native->exists($path); }
    public function isFile(string $path): bool { return $this->native->isFile($path); }
    public function isLink(string $path): bool { return $this->native->isLink($path); }
    public function entries(string $path): array { return $this->native->entries($path); }
    public function delete(string $path): void { $this->native->delete($path); }
}

function filesystemRoot(): string { return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'news-scraper-php-test-' . bin2hex(random_bytes(8)); }
function filesystemActivation(string $id, string $profileKey = 'weekly-desk', ?DateTimeImmutable $at = null): ProfileActivation
{
    $at ??= new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $page = syncPageFor($profileKey, [syncArticle($id)], null, 'revision-' . $id);
    $facts = new SynchronizationFacts($profileKey, SynchronizationResult::SUCCESS, $at, $at, 0.0, 1, 1, false, null, $at, 'news-scraper-php');
    return new ProfileActivation($profileKey, $page->profile, $page->publication, $page->apiVersion, $page->snapshotRevision, $page->etag, $page->generatedAt, $page->items, $facts);
}

function filesystemDigestActivation(string $id, ?DistributionDigest $digest): ProfileActivation
{
    $activation = filesystemActivation($id);
    return new ProfileActivation($activation->profileKey, $activation->profile, $activation->publication, $activation->apiVersion, $activation->snapshotRevision, $activation->etag, $activation->generatedAt, $activation->items, $activation->facts, $digest);
}

testCase('filesystem store commits immutable generations through one manifest and ignores orphans', static function (): void {
    $root = filesystemRoot();
    $store = new FilesystemProfileStateStore($root);
    $store->activate(filesystemActivation('one'));
    $first = $store->load('weekly-desk');
    same('one', $first->active->items[0]->articleId, 'first committed generation loads');
    $store->activate(filesystemActivation('two'));
    $second = $store->load('weekly-desk');
    same('two', $second->active->items[0]->articleId, 'manifest switches active generation');
    same('https://publisher.example/two', $second->active->items[0]->originalUrl, 'exact publisher destination round trips');
    $profileDirectory = $root . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk');
    $manifest = json_decode((string) file_get_contents($profileDirectory . DIRECTORY_SEPARATOR . 'manifest.json'), true, 32, JSON_THROW_ON_ERROR);
    trueValue(is_file($profileDirectory . DIRECTORY_SEPARATOR . 'generations' . DIRECTORY_SEPARATOR . $manifest['previousGeneration']), 'previous generation is retained');
    file_put_contents($profileDirectory . DIRECTORY_SEPARATOR . 'generations' . DIRECTORY_SEPARATOR . 'g-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json', '{}');
    same('two', $store->load('weekly-desk')->active->items[0]->articleId, 'orphan generation is never promoted');
    trueValue(!str_contains((string) file_get_contents($profileDirectory . DIRECTORY_SEPARATOR . 'manifest.json'), 'runtime-secret'), 'manifest never contains secret');
    file_put_contents($profileDirectory . DIRECTORY_SEPARATOR . 'manifest.json', '{');
    same(LocalProfileUsability::UNAVAILABLE, $store->readForPhase6('weekly-desk', new LocalProfileUsabilityResolver(), new FakeClock())->usability->classification, 'corrupt manifest is bounded unavailable rather than auto-promoted');
});

testCase('filesystem activation failures preserve committed manifest and active LKG', static function (): void {
    $root = filesystemRoot();
    $filesystem = new FaultInjectingFilesystem();
    $store = new FilesystemProfileStateStore($root, $filesystem);
    $store->activate(filesystemActivation('old'));
    $filesystem->failWriteContaining = '.g-';
    try { $store->activate(filesystemActivation('never')); } catch (Throwable) {}
    same('old', $store->load('weekly-desk')->active->items[0]->articleId, 'pre-generation failure preserves old active');
    $filesystem->failWriteContaining = null;
    $filesystem->failRenameContaining = 'manifest.json';
    try { $store->activate(filesystemActivation('orphan')); } catch (Throwable) {}
    same('old', $store->load('weekly-desk')->active->items[0]->articleId, 'pre-manifest failure preserves old active');
    $filesystem->failRenameContaining = null;
    $store->activate(filesystemActivation('new'));
    same('new', $store->load('weekly-desk')->active->items[0]->articleId, 'later commit can recover safely');
});

testCase('filesystem generation stores digest atomically, accepts pre-digest state, and never preserves stale digest', static function (): void {
    $root = filesystemRoot();
    $store = new FilesystemProfileStateStore($root);
    $store->activate(filesystemDigestActivation('with-digest', syncDigest()));
    same('Bounded overview.', $store->load('weekly-desk')->active->digest->overview, 'digest round trips with its active Article generation');
    $store->activate(filesystemDigestActivation('without-digest', null));
    $active = $store->load('weekly-desk')->active;
    same('without-digest', $active->items[0]->articleId, 'new Article revision activates');
    same(null, $active->digest, 'new null digest does not retain prior digest');
    $profileDirectory = $root . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk');
    $manifest = json_decode((string) file_get_contents($profileDirectory . DIRECTORY_SEPARATOR . 'manifest.json'), true, 32, JSON_THROW_ON_ERROR);
    $generation = $profileDirectory . DIRECTORY_SEPARATOR . 'generations' . DIRECTORY_SEPARATOR . $manifest['activeGeneration'];
    $data = json_decode((string) file_get_contents($generation), true, 32, JSON_THROW_ON_ERROR);
    unset($data['digest']);
    file_put_contents($generation, json_encode($data, JSON_THROW_ON_ERROR));
    same(null, $store->load('weekly-desk')->active->digest, 'pre-digest generation remains readable as null');
    $serialized = (string) file_get_contents($generation);
    foreach (['runtime-secret', 'prompt', 'attempt', 'rawResponse'] as $forbidden) trueValue(!str_contains($serialized, $forbidden), 'generation excludes ' . $forbidden);
    same([], array_values(array_filter(scandir($profileDirectory) ?: [], static fn (string $name): bool => str_contains($name, 'digest'))), 'no parallel digest state file exists');
});

testCase('filesystem disabled transitions, health, and freshness remain atomic and bounded', static function (): void {
    $root = filesystemRoot();
    $store = new FilesystemProfileStateStore($root);
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    same(LocalProfileUsability::NEVER_SYNCED, $store->readForPhase6('weekly-desk', new LocalProfileUsabilityResolver(), new FakeClock($at))->usability->classification, 'missing committed state is never synced');
    $activation = filesystemActivation('active', 'weekly-desk', $at);
    $store->activate($activation);
    $disabledFacts = new SynchronizationFacts('weekly-desk', SynchronizationResult::DISABLED, $at, $at, 0.0, 1, 0, false, null, $at, 'news-scraper-php');
    $store->markDisabled('weekly-desk', $disabledFacts);
    $state = $store->load('weekly-desk');
    same('active', $state->active->items[0]->articleId, 'disable retains active payload');
    same(LocalProfileUsability::DISABLED, (new LocalProfileUsabilityResolver())->resolve($state, $at)->classification, 'disabled overrides freshness');
    $store->recordUnchanged(new UnchangedSynchronization('weekly-desk', 'etag-new', new SynchronizationFacts('weekly-desk', SynchronizationResult::UNCHANGED, $at, $at, 0.0, 1, null, true, null, $at, 'news-scraper-php')));
    $state = $store->load('weekly-desk');
    same(false, $state->disabled, 'unchanged authenticated read re-enables');
    same(LocalProfileUsability::STALE_USABLE, (new LocalProfileUsabilityResolver())->resolve($state, $at->modify('+901 seconds'))->classification, 'default stale data remains usable');
    same(LocalProfileUsability::STALE_USABLE, (new LocalProfileUsabilityResolver(900, 1_000))->resolve($state, $at->modify('+1000 seconds'))->classification, 'configured stale cutoff remains usable at the boundary');
    same(LocalProfileUsability::STALE_CUTOFF, (new LocalProfileUsabilityResolver(900, 1_000))->resolve($state, $at->modify('+1001 seconds'))->classification, 'configured stale cutoff is enforced');
    same('unchanged', $store->health('weekly-desk')->syncResult, 'health contains the latest bounded result facts');
});

testCase('cadence uses last attempt, has a 900-second default, and configuration never echoes secrets', static function (): void {
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $health = new \NewsScraper\Integration\Php\LocalProfileHealth('weekly-desk', $at, null, 'failed', null, null, null, false, null, null, 'transport_failure', false, 'news-scraper-php');
    $cadence = new ProfileCadence();
    same(false, $cadence->decide($health, $at->modify('+899 seconds'))->due, 'failed attempt prevents cron-frequency hammering');
    same(true, $cadence->decide($health, $at->modify('+900 seconds'))->due, 'default cadence is 900 seconds');
    same(true, $cadence->decide($health, $at, true)->due, 'force bypasses due check only');
    $store = new FilesystemProfileStateStore(filesystemRoot());
    $store->recordFailure('weekly-desk', new SynchronizationFacts('weekly-desk', SynchronizationResult::FAILED, $at, $at, 0.0, null, null, false, 'transport_failure', null, 'news-scraper-php'));
    $client = new ScriptedPageClient([new DistributionOutcome(DistributionOutcome::INVALID_RESPONSE)]);
    $lock = new FakeProfileLock();
    $runtime = new \NewsScraper\Integration\Php\ProfileSyncRuntime($store, new ProfileSynchronizer($client, $store, $lock, new FakeClock($at->modify('+899 seconds')), new FakeSleeper()), new ProfileCadence(), new FakeClock($at->modify('+899 seconds')));
    $notDue = $runtime->run('weekly-desk');
    trueValue($notDue instanceof \NewsScraper\Integration\Php\CadenceDecision && !$notDue->due, 'not-due run is a successful no-op');
    same([], $client->requests, 'not-due run performs no upstream request');
    $runtime->run('weekly-desk', true);
    same(1, count($lock->attempts), 'forced run still takes the same per-Profile lock');
    try { IntegrationRuntimeConfiguration::fromEnvironment(['NEWS_SCRAPER_BASE_URL'=>'https://api.example.test','NEWS_SCRAPER_PROFILE_KEY'=>'weekly-desk','NEWS_SCRAPER_STATE_ROOT'=>'relative','NEWS_SCRAPER_BEARER_TOKEN'=>'test-bearer-secret']); failTest('relative root accepted'); } catch (InvalidArgumentException $error) { trueValue(!str_contains($error->getMessage(), 'test-bearer-secret'), 'configuration error is secret-free'); }
});

testCase('local read configuration is independent from upstream credentials and bounded', static function (): void {
    $root = filesystemRoot();
    $configuration = LocalReadConfiguration::fromEnvironment([
        'NEWS_SCRAPER_PROFILE_KEY' => 'weekly-desk',
        'NEWS_SCRAPER_STATE_ROOT' => $root,
        'NEWS_SCRAPER_SYNC_CADENCE_SECONDS' => '901',
        'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS' => '3600',
    ]);
    same('weekly-desk', $configuration->profileKey, 'local Profile key is accepted');
    same($root, $configuration->stateRoot(), 'local state root is accepted');
    same(901, $configuration->cadenceSeconds, 'local cadence is accepted');
    same(3600, $configuration->maximumStaleAgeSeconds, 'local stale age is accepted');

    try {
        LocalReadConfiguration::fromEnvironment(['NEWS_SCRAPER_PROFILE_KEY' => 'weekly-desk']);
        failTest('missing local state root accepted');
    } catch (InvalidArgumentException $error) {
        trueValue(!str_contains($error->getMessage(), 'bearer'), 'missing local setting error is bounded');
    }
    foreach ([
        ['NEWS_SCRAPER_PROFILE_KEY' => 'weekly-desk', 'NEWS_SCRAPER_STATE_ROOT' => $root, 'NEWS_SCRAPER_SYNC_CADENCE_SECONDS' => '0'],
        ['NEWS_SCRAPER_PROFILE_KEY' => 'weekly-desk', 'NEWS_SCRAPER_STATE_ROOT' => $root, 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS' => '0'],
    ] as $environment) {
        try {
            LocalReadConfiguration::fromEnvironment($environment);
            failTest('invalid local freshness setting accepted');
        } catch (InvalidArgumentException) {
        }
    }
    try {
        new LocalReadConfiguration('weekly-desk', 'relative-state-root');
        failTest('relative local state root accepted');
    } catch (InvalidArgumentException $error) {
        trueValue(!str_contains($error->getMessage(), 'runtime-secret'), 'state-root error is secret-free');
    }
});

testCase('package-owned env files keep local-read authority and sync secrets isolated', static function (): void {
    $root = filesystemRoot();
    $localPath = $root . DIRECTORY_SEPARATOR . 'local-read.env';
    $syncPath = $root . DIRECTORY_SEPARATOR . 'sync.env';
    file_put_contents($localPath, "# shared non-secret settings\nNEWS_SCRAPER_PROFILE_KEY=weekly-desk\nNEWS_SCRAPER_STATE_ROOT={$root}\nNEWS_SCRAPER_SYNC_CADENCE_SECONDS=901\nNEWS_SCRAPER_MAX_STALE_AGE_SECONDS=3600\n");
    file_put_contents($syncPath, "NEWS_SCRAPER_BASE_URL=https://api.example.test\nNEWS_SCRAPER_BEARER_TOKEN=sync-secret-value\nNEWS_SCRAPER_TIMEOUT_SECONDS=21\nNEWS_SCRAPER_MAX_RESPONSE_BYTES=4096\nNEWS_SCRAPER_PROFILE_KEY=weekly-desk\nNEWS_SCRAPER_STATE_ROOT={$root}\nNEWS_SCRAPER_SYNC_CADENCE_SECONDS=901\nNEWS_SCRAPER_MAX_STALE_AGE_SECONDS=3600\n");

    $local = IntegrationConfigurationLoader::loadLocalRead($localPath);
    same('weekly-desk', $local->profileKey, 'local-read env supplies the Profile key');
    same($root, $local->stateRoot(), 'local-read env supplies the state root');
    same(901, $local->cadenceSeconds, 'local-read env supplies cadence');
    trueValue(!str_contains(serialize($local), 'sync-secret-value'), 'local configuration never contains the bearer credential');

    $sync = IntegrationConfigurationLoader::loadSynchronization($localPath, $syncPath);
    same('weekly-desk', $sync->profileKey, 'matching legacy Profile alias is ignored as authority');
    same($root, $sync->stateRoot, 'matching legacy root alias is ignored as authority');
    same(901, $sync->cadenceSeconds, 'matching legacy cadence alias is ignored as authority');
    same(21, $sync->timeoutSeconds, 'sync env supplies transport settings');

    file_put_contents($syncPath, "NEWS_SCRAPER_BASE_URL=https://api.example.test\nNEWS_SCRAPER_BEARER_TOKEN=sync-secret-value\nNEWS_SCRAPER_PROFILE_KEY=other-profile\n");
    try {
        IntegrationConfigurationLoader::loadSynchronization($localPath, $syncPath);
        failTest('mismatched legacy alias was accepted');
    } catch (InvalidArgumentException $error) {
        trueValue(str_contains($error->getMessage(), 'does not match local-read.env'), 'legacy mismatch fails clearly');
        trueValue(!str_contains($error->getMessage(), 'sync-secret-value'), 'legacy mismatch does not expose a bearer value');
    }
});

function packageFixture(string $version = '2.2.5'): string
{
    $root = filesystemRoot();
    mkdir($root . DIRECTORY_SEPARATOR . 'src', 0700, true);
    file_put_contents($root . DIRECTORY_SEPARATOR . 'VERSION', $version . "\n");
    file_put_contents($root . DIRECTORY_SEPARATOR . 'integration-package.json', json_encode([
        'name' => 'news-scraper-php-integration',
        'product' => 'news-scraper',
        'version' => $version,
        'apiVersion' => 'v1',
    ], JSON_THROW_ON_ERROR));
    foreach (['run-sync.php', 'local-read.php', 'top-tag.php', 'preflight.php', 'src/bootstrap.php'] as $file) {
        $path = $root . DIRECTORY_SEPARATOR . $file;
        $parent = dirname($path);
        if (!is_dir($parent)) mkdir($parent, 0700, true);
        file_put_contents($path, "<?php\n");
    }
    return $root;
}

function preflightLocalConfig(string $privateRoot, string $stateRoot): void
{
    if (!is_dir($privateRoot)) mkdir($privateRoot, 0700, true);
    file_put_contents(
        $privateRoot . DIRECTORY_SEPARATOR . 'local-read.env',
        "NEWS_SCRAPER_PROFILE_KEY=weekly-desk\nNEWS_SCRAPER_STATE_ROOT={$stateRoot}\nNEWS_SCRAPER_SYNC_CADENCE_SECONDS=900\n",
    );
}

function preflightCategory(callable $operation): string
{
    try {
        $operation();
    } catch (InvalidArgumentException $error) {
        return $error->getMessage();
    }
    failTest('preflight accepted invalid input');
}

testCase('package metadata and preflight are coherent, non-destructive, and secret-safe', static function (): void {
    $package = packageFixture();
    $private = filesystemRoot();
    $state = filesystemRoot();
    preflightLocalConfig($private, $state);
    $store = new FilesystemProfileStateStore($state);
    $store->activate(filesystemActivation('preflight-lkg'));
    file_put_contents(
        $private . DIRECTORY_SEPARATOR . 'sync.env',
        "NEWS_SCRAPER_BASE_URL=https://api.example.test\nNEWS_SCRAPER_BEARER_TOKEN=preflight-secret-value\nNEWS_SCRAPER_TIMEOUT_SECONDS=20\nNEWS_SCRAPER_MAX_RESPONSE_BYTES=2048\nNEWS_SCRAPER_PROFILE_KEY=weekly-desk\n",
    );
    $profileDirectory = $state . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk');
    $manifest = $profileDirectory . DIRECTORY_SEPARATOR . 'manifest.json';
    $generation = $profileDirectory . DIRECTORY_SEPARATOR . 'generations' . DIRECTORY_SEPARATOR . json_decode((string) file_get_contents($manifest), true, 32, JSON_THROW_ON_ERROR)['activeGeneration'];
    $before = [
        hash_file('sha256', $private . DIRECTORY_SEPARATOR . 'local-read.env'),
        hash_file('sha256', $private . DIRECTORY_SEPARATOR . 'sync.env'),
        hash_file('sha256', $manifest),
        hash_file('sha256', $generation),
    ];

    same('2.2.5', PackageMetadataReader::read($package)->version, 'package metadata resolves the installed version');
    $result = PackagePreflight::run($package, $private, true);
    same('2.2.5', $result['version'], 'preflight reports package-owned version');
    same(['package', 'runtime', 'local_config', 'sync_config', 'state'], $result['checks'], 'preflight reports bounded checks');
    same($before, [
        hash_file('sha256', $private . DIRECTORY_SEPARATOR . 'local-read.env'),
        hash_file('sha256', $private . DIRECTORY_SEPARATOR . 'sync.env'),
        hash_file('sha256', $manifest),
        hash_file('sha256', $generation),
    ], 'preflight does not mutate private configuration or LKG');
    same('preflight-lkg', $store->load('weekly-desk')->active->items[0]->articleId, 'existing customer Article LKG remains readable');
    trueValue(!str_contains((string) file_get_contents($manifest), '2.2.5'), 'installed package version is not durable state authority');
    trueValue(!str_contains(serialize($result), 'preflight-secret-value'), 'preflight output omits synchronization credentials');
});

testCase('package metadata and preflight fail in stable bounded categories', static function (): void {
    $package = packageFixture();
    $private = filesystemRoot();
    $state = filesystemRoot();
    preflightLocalConfig($private, $state);
    file_put_contents($package . DIRECTORY_SEPARATOR . 'integration-package.json', '{');
    try {
        PackageMetadataReader::read($package);
        failTest('malformed package metadata was accepted');
    } catch (PackageMetadataException $error) {
        trueValue(!str_contains($error->getMessage(), $package), 'metadata failure omits filesystem detail');
    }
    same('package_metadata_invalid', preflightCategory(static fn (): array => PackagePreflight::run($package, $private, false)), 'invalid metadata category');

    $package = packageFixture();
    unlink($package . DIRECTORY_SEPARATOR . 'top-tag.php');
    same('package_files_missing', preflightCategory(static fn (): array => PackagePreflight::run($package, $private, false)), 'missing required package file category');

    $package = packageFixture();
    file_put_contents($private . DIRECTORY_SEPARATOR . 'local-read.env', "NEWS_SCRAPER_PROFILE_KEY=weekly-desk\nNEWS_SCRAPER_STATE_ROOT=relative\n");
    same('local_config_invalid', preflightCategory(static fn (): array => PackagePreflight::run($package, $private, false)), 'invalid local configuration category');

    preflightLocalConfig($private, $state);
    file_put_contents($private . DIRECTORY_SEPARATOR . 'sync.env', "NEWS_SCRAPER_BASE_URL=https://api.example.test\nNEWS_SCRAPER_BEARER_TOKEN=preflight-secret-value\nNEWS_SCRAPER_PROFILE_KEY=wrong-profile\n");
    $category = preflightCategory(static fn (): array => PackagePreflight::run($package, $private, true));
    same('sync_config_invalid', $category, 'invalid sync configuration category');
    trueValue(!str_contains($category, 'preflight-secret-value'), 'preflight category omits bearer value');

    $unusable = filesystemRoot() . DIRECTORY_SEPARATOR . 'missing';
    preflightLocalConfig($private, $unusable);
    same('state_root_unusable', preflightCategory(static fn (): array => PackagePreflight::run($package, $private, false)), 'missing state root category');
});

testCase('fresh state-root preflight remains non-mutating and does not attempt upstream access', static function (): void {
    $package = packageFixture();
    $private = filesystemRoot();
    $state = filesystemRoot();
    preflightLocalConfig($private, $state);
    same(['package', 'runtime', 'local_config', 'state'], PackagePreflight::run($package, $private, false)['checks'], 'offline preflight accepts an empty usable state root');
    same([], array_values(array_filter(scandir($state) ?: [], static fn (string $entry): bool => !in_array($entry, ['.', '..'], true))), 'offline preflight creates no state files');
});

testCase('env parser fails boundedly and treats interpolation-like values as literal data', static function (): void {
    $root = filesystemRoot();
    $valid = $root . DIRECTORY_SEPARATOR . 'valid.env';
    file_put_contents($valid, "VALUE=\$(php -r 'echo unsafe')\nPHP=<?= unsafe ?>\n");
    $values = EnvironmentFileLoader::load($valid);
    same("\$(php -r 'echo unsafe')", $values['VALUE'], 'shell-like value remains literal');
    same('<?= unsafe ?>', $values['PHP'], 'PHP-like value remains literal');

    foreach ([
        $root . DIRECTORY_SEPARATOR . 'missing.env',
        $root,
    ] as $path) {
        try {
            EnvironmentFileLoader::load($path);
            failTest('missing or unreadable config was accepted');
        } catch (InvalidArgumentException) {
        }
    }
    foreach (["NOT_A_SETTING\n", "VALUE=one\nVALUE=two\n", " VALUE=one\n"] as $contents) {
        $invalid = $root . DIRECTORY_SEPARATOR . 'invalid.env';
        file_put_contents($invalid, $contents);
        try {
            EnvironmentFileLoader::load($invalid);
            failTest('malformed config was accepted');
        } catch (InvalidArgumentException) {
        }
    }
});

testCase('stable package entrypoints preserve the canonical command and local-only boundary', static function (): void {
    $launcher = (string) file_get_contents(__DIR__ . '/../run-sync.php');
    trueValue(str_contains($launcher, 'local-read.env') && str_contains($launcher, 'sync.env'), 'launcher loads both private config files');
    trueValue(str_contains($launcher, 'SynchronizationCommand::run') && str_contains($launcher, 'array_slice($argv, 1)'), 'launcher forwards CLI arguments to the canonical command');
    trueValue(!str_contains($launcher, 'NEWS_SCRAPER_BEARER_TOKEN'), 'launcher never places bearer values on a command line');

    $entry = (string) file_get_contents(__DIR__ . '/../local-read.php');
    trueValue(str_contains($entry, 'function news_scraper_local_read') && str_contains($entry, 'local-read.env'), 'customer entry loads the stable local config');
    foreach (['sync.env', 'NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN', 'manifest.json', 'generation'] as $forbidden) {
        trueValue(!str_contains($entry, $forbidden), 'customer entry omits ' . $forbidden);
    }
});

testCase('local reader maps the complete ordered active payload and preserves nullable fields', static function (): void {
    $root = filesystemRoot();
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $first = new DistributionArticle(
        'article-rich',
        'Rich headline',
        'https://publisher.example/exact/path?edition=weekly',
        '2026-08-21T14:00:00Z',
        'published_at',
        '2026-08-21T14:01:02Z',
        'Author Name',
        'Summary text',
        'https://publisher.example/image.jpg',
        new DistributionSource('source-z', 'Source Z'),
        [new DistributionCategory('category-b', 'Category B'), new DistributionCategory('category-a', 'Category A')],
    );
    $second = new DistributionArticle(
        'article-null',
        'Null headline',
        'https://publisher.example/null',
        '2026-08-21T13:00:00Z',
        'updated_at',
        null,
        null,
        null,
        null,
        new DistributionSource('source-a', 'Source A'),
        [],
    );
    $store = new FilesystemProfileStateStore($root);
    $store->activate(localReadActivation($at, [$first, $second]));
    $result = (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at->modify('+10 seconds'))))->read();

    same(LocalReadResult::USABLE, $result->state, 'fresh active state is usable');
    trueValue($result->isRenderable(), 'usable state is renderable');
    same('weekly-desk', $result->profile?->configKey, 'Profile key maps');
    same('Weekly Desk', $result->profile?->displayName, 'Profile name maps');
    same('Example Publication', $result->publication?->name, 'Publication maps');
    same(2, count($result->articles), 'all active Articles map');
    /** @var LocalReadArticle $mappedFirst */
    $mappedFirst = $result->articles[0];
    same('article-rich', $mappedFirst->articleId, 'Article order is preserved');
    same('https://publisher.example/exact/path?edition=weekly', $mappedFirst->originalUrl, 'exact original URL is preserved');
    same('2026-08-21T14:00:00Z', $mappedFirst->effectiveFeedDate, 'effective feed date is preserved');
    same('published_at', $mappedFirst->feedDateSource, 'feed date source is preserved');
    same('2026-08-21T14:01:02Z', $mappedFirst->publishedAt, 'published timestamp is preserved');
    same('Author Name', $mappedFirst->author, 'author is preserved');
    same('Summary text', $mappedFirst->summary, 'summary is preserved');
    same('https://publisher.example/image.jpg', $mappedFirst->imageUrl, 'image URL is preserved');
    same('source-z', $mappedFirst->source->configKey, 'Source key is preserved');
    same('Source Z', $mappedFirst->source->displayName, 'Source name is preserved');
    same(['category-b', 'category-a'], array_map(static fn ($category): string => $category->configKey, $mappedFirst->categories), 'Category order is preserved');
    $mappedSecond = $result->articles[1];
    same(null, $mappedSecond->publishedAt, 'nullable published timestamp is preserved');
    same(null, $mappedSecond->author, 'nullable author is preserved');
    same(null, $mappedSecond->summary, 'nullable summary is preserved');
    same(null, $mappedSecond->imageUrl, 'nullable image URL is preserved');
});

testCase('local reader exposes digest only with a renderable local snapshot and keeps LKG age independent', static function (): void {
    $root = filesystemRoot();
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $store = new FilesystemProfileStateStore($root);
    $activation = localReadActivation($at, []);
    $store->activate(new ProfileActivation($activation->profileKey, $activation->profile, $activation->publication, $activation->apiVersion, $activation->snapshotRevision, $activation->etag, $activation->generatedAt, $activation->items, $activation->facts, syncDigest()));
    $usable = (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at->modify('+10 seconds'))))->read();
    same('current', $usable->digest->freshness, 'local digest preserves P3 freshness');
    same('2026-08-21T14:30:00.000Z', $usable->digest->generatedAt, 'local digest preserves generated timestamp');
    same(10, $usable->staleAgeSeconds, 'local age remains snapshot synchronization age');
    $cutoff = (new LocalProfileReader(localReadConfiguration($root, 5), $store, new FakeClock($at->modify('+10 seconds'))))->read();
    same(LocalReadResult::STALE_CUTOFF, $cutoff->state, 'stale cutoff remains authoritative');
    same(null, $cutoff->digest, 'non-renderable state suppresses retained digest');
    $store->markDisabled('weekly-desk', new SynchronizationFacts('weekly-desk', SynchronizationResult::DISABLED, $at, $at, 0.0, 0, 1, false, null, $at, 'news-scraper-php'));
    same(null, (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at)))->read()->digest, 'disabled state suppresses retained digest');
});

testCase('local reader exposes empty, stale, never-synced, cutoff, disabled, and unavailable states safely', static function (): void {
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');

    $emptyRoot = filesystemRoot();
    $emptyStore = new FilesystemProfileStateStore($emptyRoot);
    $emptyStore->activate(localReadActivation($at, []));
    $empty = (new LocalProfileReader(localReadConfiguration($emptyRoot), $emptyStore, new FakeClock($at)))->read();
    same(LocalReadResult::USABLE, $empty->state, 'empty active snapshot remains usable');
    trueValue($empty->isRenderable(), 'empty active snapshot remains renderable');
    same([], $empty->articles, 'empty active snapshot has no Articles');

    $staleRoot = filesystemRoot();
    $staleStore = new FilesystemProfileStateStore($staleRoot);
    $staleStore->activate(localReadActivation($at, [syncArticle('stale')]));
    $stale = (new LocalProfileReader(localReadConfiguration($staleRoot), $staleStore, new FakeClock($at->modify('+901 seconds'))))->read();
    same(LocalReadResult::STALE_USABLE, $stale->state, 'stale active snapshot is stale usable');
    trueValue($stale->isRenderable(), 'stale usable data remains renderable');
    same(901, $stale->staleAgeSeconds, 'stale age is exposed');

    $neverRoot = filesystemRoot();
    $never = (new LocalProfileReader(localReadConfiguration($neverRoot), new FilesystemProfileStateStore($neverRoot), new FakeClock($at)))->read();
    same(LocalReadResult::NEVER_SYNCED, $never->state, 'missing state is never synced');
    trueValue(!$never->isRenderable() && $never->articles === [], 'never synced state has no renderable payload');

    $cutoffRoot = filesystemRoot();
    $cutoffStore = new FilesystemProfileStateStore($cutoffRoot);
    $cutoffStore->activate(localReadActivation($at, [syncArticle('cutoff')]));
    $cutoff = (new LocalProfileReader(localReadConfiguration($cutoffRoot, 1000), $cutoffStore, new FakeClock($at->modify('+1001 seconds'))))->read();
    same(LocalReadResult::STALE_CUTOFF, $cutoff->state, 'stale cutoff is authoritative');
    trueValue(!$cutoff->isRenderable() && $cutoff->articles === [], 'stale cutoff suppresses retained active data');

    $disabledRoot = filesystemRoot();
    $disabledStore = new FilesystemProfileStateStore($disabledRoot);
    $disabledStore->activate(localReadActivation($at, [syncArticle('disabled')]));
    $disabledStore->markDisabled('weekly-desk', new SynchronizationFacts('weekly-desk', SynchronizationResult::DISABLED, $at, $at, 0.1, 1, 1, false, null, $at, 'news-scraper-php'));
    $disabled = (new LocalProfileReader(localReadConfiguration($disabledRoot), $disabledStore, new FakeClock($at)))->read();
    same(LocalReadResult::DISABLED, $disabled->state, 'authoritative disabled state wins');
    trueValue(!$disabled->isRenderable() && $disabled->articles === [], 'disabled state suppresses retained active data');

    $unavailableRoot = filesystemRoot();
    $unavailableStore = new FilesystemProfileStateStore($unavailableRoot);
    $unavailableStore->activate(localReadActivation($at, [syncArticle('corrupt')]));
    $manifest = $unavailableRoot . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk') . DIRECTORY_SEPARATOR . 'manifest.json';
    file_put_contents($manifest, '{');
    $unavailable = (new LocalProfileReader(localReadConfiguration($unavailableRoot), $unavailableStore, new FakeClock($at)))->read();
    same(LocalReadResult::UNAVAILABLE, $unavailable->state, 'corrupt committed state is unavailable');
    trueValue(!$unavailable->isRenderable() && $unavailable->articles === [], 'unavailable state has no partial payload');
});

testCase('local reader exposes bounded redacted health and only the Phase 6 producer boundary', static function (): void {
    $root = filesystemRoot();
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $store = new FilesystemProfileStateStore($root);
    $store->activate(localReadActivation($at, [syncArticle('health')]));
    $result = (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at)))->read();
    same('weekly-desk', $result->health->profileKey, 'health identifies the Profile');
    same('success', $result->health->syncResult, 'health exposes sync result');
    same(1, $result->health->itemCount, 'health exposes item count');
    same(1, $result->health->pageCount, 'health exposes page count');
    same('local-revision', $result->health->activeRevision, 'health exposes active revision');
    same('local-etag', $result->health->activeEtag, 'health exposes active ETag');
    $serialized = serialize($result);
    foreach (['runtime-secret', 'Authorization', 'cursor', $root . DIRECTORY_SEPARATOR . 'profiles', 'manifest.json', 'generation'] as $forbidden) {
        trueValue(!str_contains($serialized, $forbidden), 'local result omits ' . $forbidden);
    }

    $source = (string) file_get_contents(__DIR__ . '/../src/LocalRead.php');
    foreach (['DistributionPageClient', 'ClientConfiguration', 'Gemini', 'gemini', 'manifest.json', 'generation', 'NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN'] as $forbidden) {
        trueValue(!str_contains($source, $forbidden), 'local reader source omits ' . $forbidden);
    }
});

/* Superseded P2 renderer tests retained only as historical context during the package transition.
testCase('fallback renderer safely escapes untrusted values and preserves direct article links and order', static function (): void {
    $root = filesystemRoot();
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $first = new DistributionArticle(
        'article-two',
        '<script>alert("headline")</script>',
        'https://publisher.example/story?edition="weekly"&amp=1',
        '2026-08-21T14:00:00Z',
        'published_at',
        '2026-08-21T14:01:02Z',
        'Author <img src=x onerror=alert(1)>',
        'Summary </p><script>alert(2)</script>',
        null,
        new DistributionSource('source-one', 'Source <b>One</b>'),
        [new DistributionCategory('category-one', 'Category <i>One</i>')],
    );
    $second = syncArticle('article-one');
    $store = new FilesystemProfileStateStore($root);
    $store->activate(new ProfileActivation(
        'weekly-desk',
        new DistributionProfile('weekly-desk', 'Profile <em>Name</em>'),
        new DistributionPublication('Publication & "Name"'),
        'v1',
        'renderer-revision',
        'renderer-etag',
        $at->format(DATE_ATOM),
        [$first, $second],
        new SynchronizationFacts('weekly-desk', SynchronizationResult::SUCCESS, $at, $at, 0.1, 2, 1, false, null, $at, 'news-scraper-php'),
    ));
    $result = (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at)))->read();
    $html = (new FallbackHtmlRenderer())->render($result);

    trueValue(str_contains($html, 'Profile &lt;em&gt;Name&lt;/em&gt;'), 'Profile markup is escaped');
    trueValue(str_contains($html, 'Publication &amp; &quot;Name&quot;'), 'Publication markup and quotes are escaped');
    trueValue(str_contains($html, '&lt;script&gt;alert(&quot;headline&quot;)&lt;/script&gt;'), 'headline markup is escaped');
    trueValue(str_contains($html, 'Author &lt;img src=x onerror=alert(1)&gt;'), 'author markup is escaped');
    trueValue(str_contains($html, 'Summary &lt;/p&gt;&lt;script&gt;alert(2)&lt;/script&gt;'), 'summary markup is escaped');
    trueValue(str_contains($html, 'Source &lt;b&gt;One&lt;/b&gt;'), 'Source markup is escaped');
    trueValue(str_contains($html, 'Category &lt;i&gt;One&lt;/i&gt;'), 'Category markup is escaped');
    trueValue(str_contains($html, 'href="https://publisher.example/story?edition=&quot;weekly&quot;&amp;amp=1"'), 'URL is escaped for an HTML attribute');
    trueValue(str_contains($html, 'https://publisher.example/story?edition=&quot;weekly&quot;&amp;amp=1'), 'exact URL value remains the direct logical destination');
    preg_match('/href="([^"]+)"/', $html, $hrefMatch);
    same($first->originalUrl, html_entity_decode($hrefMatch[1] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8'), 'escaped href decodes to the exact original URL');
    trueValue(str_contains($html, 'href="https://publisher.example/story?edition=&quot;weekly&quot;&amp;amp=1"') && str_contains($html, 'href="https://publisher.example/article-one"'), 'all ordered Article anchors render');
    trueValue(strpos($html, 'article-two') === false, 'Article IDs are not leaked as presentation content');
    trueValue(strpos($html, 'href="https://publisher.example/story') < strpos($html, 'href="https://publisher.example/article-one"'), 'Article order is preserved');
    trueValue(!str_contains($html, '<script') && !str_contains($html, 'onclick=') && !str_contains($html, 'target=') && !str_contains($html, ' rel='), 'core output has no executable or automatic link policy');
    trueValue(!str_contains($html, 'href="https://news-scraper') && !str_contains($html, '/redirect'), 'renderer adds no News Scraper redirect');

    $invalidUtf8 = new LocalReadResult(
        LocalReadResult::USABLE,
        new LocalReadProfile('weekly-desk', "Profile \xC3\x28"),
        new LocalReadPublication('Publication'),
        [new LocalReadArticle(
            'invalid-utf8',
            "Headline \xC3\x28",
            'https://publisher.example/invalid',
            '2026-08-21T14:00:00Z',
            'published_at',
            null,
            null,
            null,
            null,
            new LocalReadSource('source', 'Source'),
            [],
        )],
        0,
        new LocalReadHealth('weekly-desk', null, null, null, null, null, null, false, null, null, null, false, 'news-scraper-php'),
    );
    $invalidHtml = (new FallbackHtmlRenderer())->render($invalidUtf8);
    trueValue(str_contains($invalidHtml, 'Headline �(') && !str_contains($invalidHtml, "Headline \xC3\x28"), 'invalid UTF-8 is bounded with substitution');
});

testCase('fallback renderer handles nullable metadata and all local states without retained Article leakage', static function (): void {
    $renderer = new FallbackHtmlRenderer();
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');

    $emptyRoot = filesystemRoot();
    $emptyStore = new FilesystemProfileStateStore($emptyRoot);
    $emptyStore->activate(localReadActivation($at, []));
    $empty = (new LocalProfileReader(localReadConfiguration($emptyRoot), $emptyStore, new FakeClock($at)))->read();
    $emptyHtml = $renderer->render($empty);
    trueValue(str_contains($emptyHtml, 'No articles are currently available.'), 'empty usable state has an explicit empty message');
    trueValue(!str_contains($emptyHtml, '<a '), 'empty usable state has no Article anchors');

    $nullableRoot = filesystemRoot();
    $nullableStore = new FilesystemProfileStateStore($nullableRoot);
    $nullableStore->activate(localReadActivation($at, [syncArticle('nullable')]));
    $nullable = (new LocalProfileReader(localReadConfiguration($nullableRoot), $nullableStore, new FakeClock($at)))->read();
    $nullableHtml = $renderer->render($nullable);
    trueValue(str_contains($nullableHtml, 'Headline nullable'), 'nullable Article still renders its headline and link');
    trueValue(!str_contains($nullableHtml, 'Published:') && !str_contains($nullableHtml, 'By '), 'nullable publishedAt and author are omitted');
    trueValue(!str_contains($nullableHtml, 'news-scraper-summary') && !str_contains($nullableHtml, 'news-scraper-categories'), 'nullable summary and empty categories are omitted');
    trueValue(preg_match('/>\s*(?:null|undefined)\s*</i', $nullableHtml) !== 1, 'nullable fields do not become placeholder text');

    $staleRoot = filesystemRoot();
    $staleStore = new FilesystemProfileStateStore($staleRoot);
    $staleStore->activate(localReadActivation($at, [syncArticle('stale')]));
    $stale = (new LocalProfileReader(localReadConfiguration($staleRoot), $staleStore, new FakeClock($at->modify('+901 seconds'))))->read();
    $staleHtml = $renderer->render($stale);
    trueValue(str_contains($staleHtml, 'Headline stale') && str_contains($staleHtml, '901 seconds'), 'stale usable retains Articles and exposes bounded freshness');

    $states = [
        LocalReadResult::NEVER_SYNCED => static function () use ($at): LocalReadResult {
            $root = filesystemRoot();
            return (new LocalProfileReader(localReadConfiguration($root), new FilesystemProfileStateStore($root), new FakeClock($at)))->read();
        },
        LocalReadResult::STALE_CUTOFF => static function () use ($at): LocalReadResult {
            $root = filesystemRoot();
            $store = new FilesystemProfileStateStore($root);
            $store->activate(localReadActivation($at, [syncArticle('cutoff')]));
            return (new LocalProfileReader(localReadConfiguration($root, 1000), $store, new FakeClock($at->modify('+1001 seconds'))))->read();
        },
        LocalReadResult::DISABLED => static function () use ($at): LocalReadResult {
            $root = filesystemRoot();
            $store = new FilesystemProfileStateStore($root);
            $store->activate(localReadActivation($at, [syncArticle('disabled')]));
            $store->markDisabled('weekly-desk', new SynchronizationFacts('weekly-desk', SynchronizationResult::DISABLED, $at, $at, 0.1, 1, 1, false, null, $at, 'news-scraper-php'));
            return (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at)))->read();
        },
        LocalReadResult::UNAVAILABLE => static function () use ($at): LocalReadResult {
            $root = filesystemRoot();
            $store = new FilesystemProfileStateStore($root);
            $store->activate(localReadActivation($at, [syncArticle('unavailable')]));
            $manifest = $root . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk') . DIRECTORY_SEPARATOR . 'manifest.json';
            file_put_contents($manifest, '{');
            return (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at)))->read();
        },
    ];
    $messages = [
        LocalReadResult::NEVER_SYNCED => 'Local content is initializing.',
        LocalReadResult::STALE_CUTOFF => 'Local content is unavailable because it is too old.',
        LocalReadResult::DISABLED => 'This Profile is currently disabled.',
        LocalReadResult::UNAVAILABLE => 'Local content is temporarily unavailable.',
    ];
    $retainedHeadlines = [
        LocalReadResult::NEVER_SYNCED => null,
        LocalReadResult::STALE_CUTOFF => 'Headline cutoff',
        LocalReadResult::DISABLED => 'Headline disabled',
        LocalReadResult::UNAVAILABLE => 'Headline unavailable',
    ];
    foreach ($states as $state => $read) {
        $result = $read();
        same($state, $result->state, $state . ' is mapped by P1');
        $html = $renderer->render($result);
        trueValue(!str_contains($html, '<a '), $state . ' has no Article anchors');
        trueValue(str_contains($html, $messages[$state]), $state . ' has its distinct bounded message');
        if ($retainedHeadlines[$state] !== null) {
            trueValue(!str_contains($html, $retainedHeadlines[$state]), $state . ' does not leak retained Article content');
        }
        trueValue(str_contains($html, 'news-scraper-unavailable'), $state . ' has a bounded unavailable fallback');
        trueValue(!str_contains($html, 'runtime-secret') && !str_contains($html, 'manifest.json') && !str_contains($html, 'Authorization'), $state . ' has no internal health or secret data');
    }
});

testCase('customer presentation can replace or bypass the fallback using only LocalReadResult', static function (): void {
    $root = filesystemRoot();
    $at = new DateTimeImmutable('2026-08-21T15:00:00+00:00');
    $store = new FilesystemProfileStateStore($root);
    $store->activate(localReadActivation($at, [syncArticle('custom')]));
    $result = (new LocalProfileReader(localReadConfiguration($root), $store, new FakeClock($at)))->read();
    $custom = new class implements LocalProfileRenderer {
        public function render(LocalReadResult $result): string
        {
            return 'customer:' . ($result->articles[0]->articleId ?? 'empty');
        }
    };

    same('customer:custom', $custom->render($result), 'custom renderer receives normalized local data only');
    same('custom', $result->articles[0]->articleId, 'custom renderer does not need cache or synchronization knowledge');
    $source = (string) file_get_contents(__DIR__ . '/../src/Renderer.php');
    foreach (['FilesystemProfileStateStore', 'DistributionPageClient', 'Authorization', 'manifest.json', 'generation', 'NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN'] as $forbidden) {
        trueValue(!str_contains($source, $forbidden), 'renderer boundary omits ' . $forbidden);
    }
});

testCase('customer example composes only local read and presentation boundaries', static function (): void {
    $example = (string) file_get_contents(__DIR__ . '/../example/index.php');
    foreach (['local-read.php', 'news_scraper_local_read', 'FallbackHtmlRenderer'] as $required) {
        trueValue(str_contains($example, $required), 'example composes ' . $required);
    }
    foreach (['src/bootstrap.php', 'LocalReadConfiguration', 'LocalProfileReader', 'DistributionClient', 'ProfileSynchronizer', 'NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN', 'manifest.json', 'generations'] as $forbidden) {
        trueValue(!str_contains($example, $forbidden), 'example omits visitor upstream/internal boundary ' . $forbidden);
    }
});

*/

testCase('top-tag is the only packaged customer presentation reference', static function (): void {
    $topTag = (string) file_get_contents(__DIR__ . '/../top-tag.php');
    foreach (['local-read.php', 'news_scraper_local_read', 'OPTIONAL AI DIGEST SECTION', 'ARTICLE FEED SECTION'] as $required) {
        trueValue(str_contains($topTag, $required), 'top-tag contains ' . $required);
    }
    foreach (['src/bootstrap.php', 'sync.env', 'NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN', 'FallbackHtmlRenderer', 'LocalProfileRenderer'] as $forbidden) {
        trueValue(!str_contains($topTag, $forbidden), 'top-tag omits ' . $forbidden);
    }
});

testCase('native file lock coordinates real PHP processes and leaves stale files harmless', static function (): void {
    $root = filesystemRoot();
    $bootstrap = var_export(realpath(__DIR__ . '/../src/bootstrap.php'), true);
    $script = 'require ' . $bootstrap . '; $lock = new \\NewsScraper\\Integration\\Php\\FilesystemProfileLock(' . var_export($root, true) . '); $lease = $lock->tryAcquire("weekly-desk"); echo $lease === null ? "none" : "owner"; flush(); sleep(2);';
    $process = proc_open([PHP_BINARY, '-r', $script], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
    if (!is_resource($process)) failTest('child PHP process did not start');
    $owner = stream_get_contents($pipes[1], 5);
    same('owner', $owner, 'child owns same-Profile lock');
    $lock = new FilesystemProfileLock($root);
    same(null, $lock->tryAcquire('weekly-desk'), 'same Profile cannot overlap across processes');
    $other = $lock->tryAcquire('other-profile');
    trueValue($other !== null, 'different Profile lock is independent');
    $other->release();
    proc_close($process);
    file_put_contents($root . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . hash('sha256', 'weekly-desk') . DIRECTORY_SEPARATOR . 'lock', 'stale');
    $after = $lock->tryAcquire('weekly-desk');
    trueValue($after !== null, 'stale lock file does not imply ownership');
    $after->release();
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
