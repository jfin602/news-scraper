<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class DistributionProfile
{
    public function __construct(
        public readonly string $configKey,
        public readonly string $displayName,
    ) {
    }
}

final class DistributionPublication
{
    public function __construct(public readonly string $name)
    {
    }
}

final class DistributionSource
{
    public function __construct(
        public readonly string $configKey,
        public readonly string $displayName,
    ) {
    }
}

final class DistributionCategory
{
    public function __construct(
        public readonly string $configKey,
        public readonly string $displayName,
    ) {
    }
}

final class DistributionArticle
{
    /**
     * @param array<int, DistributionCategory> $categories
     */
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
        public readonly DistributionSource $source,
        public readonly array $categories,
    ) {
    }
}

final class DistributionPage
{
    /**
     * @param array<int, DistributionArticle> $items
     */
    public function __construct(
        public readonly string $apiVersion,
        public readonly string $generatedAt,
        public readonly string $snapshotRevision,
        public readonly DistributionProfile $profile,
        public readonly DistributionPublication $publication,
        public readonly array $items,
        public readonly ?string $nextCursor,
        public readonly ?string $etag,
    ) {
    }
}

final class DistributionOutcome
{
    public const SUCCESS = 'success';
    public const NOT_MODIFIED = 'not_modified';
    public const INVALID_REQUEST = 'invalid_request';
    public const UNAUTHENTICATED = 'unauthenticated';
    public const NOT_FOUND = 'not_found';
    public const PROFILE_DISABLED = 'profile_disabled';
    public const SNAPSHOT_CHANGED = 'snapshot_changed';
    public const RATE_LIMITED = 'rate_limited';
    public const SERVICE_UNAVAILABLE = 'service_unavailable';
    public const TRANSPORT_FAILURE = 'transport_failure';
    public const INVALID_RESPONSE = 'invalid_response';

    public function __construct(
        public readonly string $kind,
        public readonly ?DistributionPage $page = null,
        public readonly ?string $etag = null,
        public readonly ?int $retryAfterSeconds = null,
    ) {
    }

    public function isSuccess(): bool
    {
        return $this->kind === self::SUCCESS;
    }
}

interface DistributionPageClient
{
    public function fetchPage(
        string $profileKey,
        ?string $cursor = null,
        ?string $activeEtag = null,
    ): DistributionOutcome;
}

final class DistributionClient implements DistributionPageClient
{
    private const MAX_STRING_LENGTH = 65_536;
    private const MAX_OPAQUE_LENGTH = 8_192;
    private const MAX_RETRY_AFTER_SECONDS = 86_400;

    public function __construct(
        private readonly ClientConfiguration $configuration,
        private readonly HttpTransport $transport,
    ) {
    }

    public function fetchPage(
        string $profileKey,
        ?string $cursor = null,
        ?string $activeEtag = null,
    ): DistributionOutcome {
        $initial = $cursor === null;
        if (!$this->validOpaqueInput($profileKey, false)) {
            return $this->invalidRequest();
        }
        if ($cursor !== null && !$this->validOpaqueInput($cursor, false)) {
            return $this->invalidRequest();
        }
        if ($activeEtag !== null && !$this->validOpaqueInput($activeEtag, true)) {
            return $this->invalidRequest();
        }
        if (!$initial && $activeEtag !== null) {
            return $this->invalidRequest();
        }

        try {
            $request = $this->buildRequest($profileKey, $cursor, $activeEtag);
            $response = $this->transport->send($request);
        } catch (\Throwable) {
            return new DistributionOutcome(DistributionOutcome::TRANSPORT_FAILURE);
        }

        if (strlen($response->body) > $this->configuration->maxResponseBytes) {
            return $this->invalidResponse();
        }

        try {
            if ($response->status === 200) {
                return $this->parsePage($response, $profileKey);
            }
            if ($response->status === 304) {
                return $this->parseNotModified($response, $initial && $activeEtag !== null);
            }

            return $this->parseErrorResponse($response);
        } catch (\Throwable) {
            return $this->invalidResponse();
        }
    }

    private function buildRequest(
        string $profileKey,
        ?string $cursor,
        ?string $activeEtag,
    ): HttpRequest {
        $url = $this->configuration->baseUrl . '/api/v1/distribution/' . rawurlencode($profileKey);
        if ($cursor !== null) {
            $url .= '?cursor=' . rawurlencode($cursor);
        }

        $headers = [
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $this->configuration->bearerCredential,
        ];
        if ($activeEtag !== null) {
            $headers['If-None-Match'] = $activeEtag;
        }

        return new HttpRequest(
            $url,
            $headers,
            $this->configuration->timeoutSeconds,
            $this->configuration->maxResponseBytes,
            false,
        );
    }

    private function parsePage(HttpResponse $response, string $requestedProfileKey): DistributionOutcome
    {
        $payload = $this->decodeObject($response->body);
        if ($payload === null) {
            return $this->invalidResponse();
        }

        $apiVersion = $this->requiredString($payload, 'apiVersion', false);
        $generatedAt = $this->requiredTimestamp($payload, 'generatedAt');
        $snapshotRevision = $this->requiredOpaque($payload, 'snapshotRevision');
        $profileData = $this->requiredObject($payload, 'profile');
        $publicationData = $this->requiredObject($payload, 'publication');
        $itemsData = $this->requiredList($payload, 'items');
        $nextCursor = $this->nullableOpaque($payload, 'nextCursor');
        if (
            $apiVersion !== 'v1' ||
            $generatedAt === null ||
            $snapshotRevision === null ||
            $profileData === null ||
            $publicationData === null ||
            $itemsData === null ||
            $nextCursor === false ||
            !array_key_exists('profile', $payload) ||
            !array_key_exists('publication', $payload) ||
            !array_key_exists('items', $payload) ||
            !array_key_exists('nextCursor', $payload)
        ) {
            return $this->invalidResponse();
        }

        $profileKey = $this->requiredString($profileData, 'configKey', false);
        $profileName = $this->requiredString($profileData, 'displayName', true);
        $publicationName = $this->requiredString($publicationData, 'name', true);
        if (
            $profileKey === null ||
            $profileName === null ||
            $publicationName === null ||
            $profileKey !== $requestedProfileKey
        ) {
            return $this->invalidResponse();
        }

        $articles = [];
        foreach ($itemsData as $itemData) {
            if (!is_array($itemData) || array_is_list($itemData)) {
                return $this->invalidResponse();
            }
            $article = $this->parseArticle($itemData);
            if ($article === null) {
                return $this->invalidResponse();
            }
            $articles[] = $article;
        }

        $etag = $this->parseOptionalHeader($response->header('etag'));
        if ($response->header('etag') !== null && $etag === null) {
            return $this->invalidResponse();
        }

        return new DistributionOutcome(
            DistributionOutcome::SUCCESS,
            new DistributionPage(
                'v1',
                $generatedAt,
                $snapshotRevision,
                new DistributionProfile($profileKey, $profileName),
                new DistributionPublication($publicationName),
                $articles,
                $nextCursor,
                $etag,
            ),
            $etag,
        );
    }

    private function parseArticle(array $item): ?DistributionArticle
    {
        $articleId = $this->requiredString($item, 'articleId', false);
        $headline = $this->requiredString($item, 'headline', true);
        $originalUrl = $this->requiredString($item, 'originalUrl', true);
        $effectiveFeedDate = $this->requiredTimestamp($item, 'effectiveFeedDate');
        $feedDateSource = $this->requiredString($item, 'feedDateSource', true);
        $publishedAt = $this->nullableTimestamp($item, 'publishedAt');
        $author = $this->nullableString($item, 'author');
        $summary = $this->nullableString($item, 'summary');
        $imageUrl = $this->nullableString($item, 'imageUrl');
        $sourceData = $this->requiredObject($item, 'source');
        $categoriesData = $this->requiredList($item, 'categories');

        if (
            $articleId === null ||
            $headline === null ||
            $originalUrl === null ||
            $effectiveFeedDate === null ||
            $feedDateSource === null ||
            $publishedAt === false ||
            $author === false ||
            $summary === false ||
            $imageUrl === false ||
            $sourceData === null ||
            $categoriesData === null ||
            !array_key_exists('publishedAt', $item) ||
            !array_key_exists('author', $item) ||
            !array_key_exists('summary', $item) ||
            !array_key_exists('imageUrl', $item)
        ) {
            return null;
        }

        $sourceKey = $this->requiredString($sourceData, 'configKey', false);
        $sourceName = $this->requiredString($sourceData, 'displayName', true);
        if ($sourceKey === null || $sourceName === null) {
            return null;
        }

        $categories = [];
        foreach ($categoriesData as $categoryData) {
            if (!is_array($categoryData) || array_is_list($categoryData)) {
                return null;
            }
            $categoryKey = $this->requiredString($categoryData, 'configKey', false);
            $categoryName = $this->requiredString($categoryData, 'displayName', true);
            if ($categoryKey === null || $categoryName === null) {
                return null;
            }
            $categories[] = new DistributionCategory($categoryKey, $categoryName);
        }

        return new DistributionArticle(
            $articleId,
            $headline,
            $originalUrl,
            $effectiveFeedDate,
            $feedDateSource,
            $publishedAt,
            $author,
            $summary,
            $imageUrl,
            new DistributionSource($sourceKey, $sourceName),
            $categories,
        );
    }

    private function parseNotModified(HttpResponse $response, bool $allowed): DistributionOutcome
    {
        if (!$allowed || $response->body !== '') {
            return $this->invalidResponse();
        }
        $etag = $this->parseOptionalHeader($response->header('etag'));
        if ($response->header('etag') !== null && $etag === null) {
            return $this->invalidResponse();
        }
        return new DistributionOutcome(DistributionOutcome::NOT_MODIFIED, null, $etag);
    }

    private function parseErrorResponse(HttpResponse $response): DistributionOutcome
    {
        $payload = $this->decodeObject($response->body);
        if ($payload === null || !isset($payload['error']) || !is_string($payload['error'])) {
            return $this->invalidResponse();
        }

        $kind = match ($response->status) {
            400 => $payload['error'] === 'invalid_request' ? DistributionOutcome::INVALID_REQUEST : null,
            401 => $payload['error'] === 'unauthenticated' ? DistributionOutcome::UNAUTHENTICATED : null,
            404 => $payload['error'] === 'not_found' ? DistributionOutcome::NOT_FOUND : null,
            409 => match ($payload['error']) {
                'profile_disabled' => DistributionOutcome::PROFILE_DISABLED,
                'snapshot_changed' => DistributionOutcome::SNAPSHOT_CHANGED,
                default => null,
            },
            503 => $payload['error'] === 'service_unavailable' ? DistributionOutcome::SERVICE_UNAVAILABLE : null,
            default => null,
        };
        if ($response->status === 429) {
            if ($payload['error'] !== 'rate_limited') {
                return $this->invalidResponse();
            }
            $retryAfter = $this->parseRetryAfter($response->header('retry-after'));
            return $retryAfter === null
                ? $this->invalidResponse()
                : new DistributionOutcome(DistributionOutcome::RATE_LIMITED, null, null, $retryAfter);
        }
        return $kind === null ? $this->invalidResponse() : new DistributionOutcome($kind);
    }

    /** @return array<string, mixed>|null */
    private function decodeObject(string $body): ?array
    {
        try {
            $value = json_decode($body, true, 32, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\Throwable) {
            return null;
        }
        return is_array($value) && !array_is_list($value) ? $value : null;
    }

    /** @param array<string, mixed> $object */
    private function requiredString(array $object, string $key, bool $allowEmpty): ?string
    {
        if (!array_key_exists($key, $object) || !is_string($object[$key]) || strlen($object[$key]) > self::MAX_STRING_LENGTH) {
            return null;
        }
        return !$allowEmpty && $object[$key] === '' ? null : $object[$key];
    }

    /** @param array<string, mixed> $object */
    private function nullableString(array $object, string $key): string|false|null
    {
        if (!array_key_exists($key, $object)) {
            return false;
        }
        if ($object[$key] === null) {
            return null;
        }
        return is_string($object[$key]) && strlen($object[$key]) <= self::MAX_STRING_LENGTH ? $object[$key] : false;
    }

    /** @param array<string, mixed> $object */
    private function requiredTimestamp(array $object, string $key): ?string
    {
        if (!array_key_exists($key, $object) || !is_string($object[$key]) || strlen($object[$key]) > 128) {
            return null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D', $object[$key]) !== 1) {
            return null;
        }
        $normalized = str_ends_with($object[$key], 'Z')
            ? substr($object[$key], 0, -1) . '+00:00'
            : $object[$key];
        if (strpos($normalized, '.') === false) {
            $normalized = substr($normalized, 0, 19) . '.000000' . substr($normalized, 19);
        } else {
            $fractionEnd = strpos($normalized, '+', 19);
            if ($fractionEnd === false) {
                $fractionEnd = strpos($normalized, '-', 19);
            }
            if ($fractionEnd !== false) {
                $fraction = substr($normalized, 20, $fractionEnd - 20);
                $normalized = substr($normalized, 0, 20) . str_pad(substr($fraction, 0, 6), 6, '0') . substr($normalized, $fractionEnd);
            }
        }
        try {
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.uP', $normalized);
        } catch (\Throwable) {
            return null;
        }
        $errors = \DateTimeImmutable::getLastErrors();
        if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
            return null;
        }
        return $object[$key];
    }

    /** @param array<string, mixed> $object */
    private function nullableTimestamp(array $object, string $key): string|false|null
    {
        if (!array_key_exists($key, $object)) {
            return false;
        }
        if ($object[$key] === null) {
            return null;
        }
        $timestamp = $this->requiredTimestamp([$key => $object[$key]], $key);
        return $timestamp ?? false;
    }

    /** @param array<string, mixed> $object */
    private function requiredOpaque(array $object, string $key): ?string
    {
        if (!array_key_exists($key, $object) || !is_string($object[$key]) || $object[$key] === '' || strlen($object[$key]) > self::MAX_OPAQUE_LENGTH) {
            return null;
        }
        return $object[$key];
    }

    /** @param array<string, mixed> $object */
    private function nullableOpaque(array $object, string $key): string|false|null
    {
        if (!array_key_exists($key, $object)) {
            return false;
        }
        if ($object[$key] === null) {
            return null;
        }
        return is_string($object[$key]) && $object[$key] !== '' && strlen($object[$key]) <= self::MAX_OPAQUE_LENGTH ? $object[$key] : false;
    }

    /** @param array<string, mixed> $object */
    private function requiredObject(array $object, string $key): ?array
    {
        return array_key_exists($key, $object) && is_array($object[$key]) && !array_is_list($object[$key]) ? $object[$key] : null;
    }

    /** @param array<string, mixed> $object */
    private function requiredList(array $object, string $key): ?array
    {
        return array_key_exists($key, $object) && is_array($object[$key]) && array_is_list($object[$key]) ? $object[$key] : null;
    }

    private function validOpaqueInput(string $value, bool $allowQuoted): bool
    {
        if ($value === '' || strlen($value) > self::MAX_OPAQUE_LENGTH || preg_match('/[\x00-\x1f\x7f]/u', $value) === 1) {
            return false;
        }
        return $allowQuoted || preg_match('/\s/u', $value) !== 1;
    }

    private function parseOptionalHeader(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        return $this->validOpaqueInput($value, true) ? $value : null;
    }

    private function parseRetryAfter(?string $value): ?int
    {
        if ($value === null || preg_match('/^\d+$/D', $value) !== 1) {
            return null;
        }
        $seconds = (int) $value;
        return $seconds > 0 && $seconds <= self::MAX_RETRY_AFTER_SECONDS ? $seconds : null;
    }

    private function invalidRequest(): DistributionOutcome
    {
        return new DistributionOutcome(DistributionOutcome::INVALID_REQUEST);
    }

    private function invalidResponse(): DistributionOutcome
    {
        return new DistributionOutcome(DistributionOutcome::INVALID_RESPONSE);
    }
}
