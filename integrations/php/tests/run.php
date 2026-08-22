<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use NewsScraper\Integration\Php\ClientConfiguration;
use NewsScraper\Integration\Php\DistributionClient;
use NewsScraper\Integration\Php\DistributionOutcome;
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
