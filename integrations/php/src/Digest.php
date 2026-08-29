<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class DistributionDigestSupport
{
    public function __construct(
        public readonly string $articleId,
        public readonly string $headline,
        public readonly string $sourceDisplayName,
        public readonly string $effectiveFeedDate,
        public readonly string $originalUrl,
    ) {
    }
}

final class DistributionDigestHighlight
{
    /** @param array<int, DistributionDigestSupport> $supportingArticles */
    public function __construct(
        public readonly string $title,
        public readonly string $explanation,
        public readonly array $supportingArticles,
    ) {
    }
}

final class DistributionDigest
{
    /** @param array<int, DistributionDigestHighlight> $highlights */
    public function __construct(
        public readonly string $generatedAt,
        public readonly string $freshness,
        public readonly int $inputArticleCount,
        public readonly string $provider,
        public readonly string $model,
        public readonly string $overview,
        public readonly array $highlights,
    ) {
    }
}

/**
 * The same narrow mapper is used for v1 input and committed-generation
 * rehydration. Optional malformed AI data maps to null; required page/state
 * validation stays outside this boundary.
 */
final class DistributionDigestMapper
{
    private const MAX_ARTICLE_ID_CODE_POINTS = 512;
    private const MAX_SUPPORT_HEADLINE_CODE_POINTS = 8_192;
    private const MAX_SOURCE_DISPLAY_NAME_CODE_POINTS = 2_000;
    private const MAX_PROVIDER_OR_MODEL_CODE_POINTS = 100;
    private const MAX_OVERVIEW_CODE_POINTS = 2_000;
    private const MAX_TITLE_CODE_POINTS = 200;
    private const MAX_EXPLANATION_CODE_POINTS = 500;
    private const MAX_GENERATED_PROSE_CODE_POINTS = 4_000;

    /** @param mixed $value */
    public static function fromArray(mixed $value): ?DistributionDigest
    {
        if (!is_array($value) || array_is_list($value)) return null;
        $generatedAt = self::timestamp($value['generatedAt'] ?? null);
        $freshness = $value['freshness'] ?? null;
        $inputArticleCount = $value['inputArticleCount'] ?? null;
        $provider = self::text($value['provider'] ?? null, 1, self::MAX_PROVIDER_OR_MODEL_CODE_POINTS);
        $model = self::text($value['model'] ?? null, 1, self::MAX_PROVIDER_OR_MODEL_CODE_POINTS);
        $overview = self::text($value['overview'] ?? null, 1, self::MAX_OVERVIEW_CODE_POINTS);
        $highlightsData = $value['highlights'] ?? null;
        if (
            $generatedAt === null ||
            !is_string($freshness) || !in_array($freshness, ['current', 'older'], true) ||
            !is_int($inputArticleCount) || $inputArticleCount < 1 || $inputArticleCount > 20 ||
            $provider === null || $model === null || $overview === null ||
            !is_array($highlightsData) || !array_is_list($highlightsData) || count($highlightsData) > 3
        ) return null;

        $highlights = [];
        $generatedProse = self::length($overview);
        foreach ($highlightsData as $highlightData) {
            if (!is_array($highlightData) || array_is_list($highlightData)) return null;
            $title = self::text($highlightData['title'] ?? null, 1, self::MAX_TITLE_CODE_POINTS);
            $explanation = self::text($highlightData['explanation'] ?? null, 1, self::MAX_EXPLANATION_CODE_POINTS);
            $supportsData = $highlightData['supportingArticles'] ?? null;
            if ($title === null || $explanation === null || !is_array($supportsData) || !array_is_list($supportsData) || count($supportsData) > 3) return null;
            $generatedProse += self::length($title) + self::length($explanation);
            if ($generatedProse > self::MAX_GENERATED_PROSE_CODE_POINTS) return null;

            $supports = [];
            foreach ($supportsData as $supportData) {
                if (!is_array($supportData) || array_is_list($supportData) || !is_array($supportData['source'] ?? null) || array_is_list($supportData['source'])) return null;
                $articleId = self::text($supportData['articleId'] ?? null, 1, self::MAX_ARTICLE_ID_CODE_POINTS);
                $headline = self::text($supportData['headline'] ?? null, 1, self::MAX_SUPPORT_HEADLINE_CODE_POINTS);
                $sourceDisplayName = self::text($supportData['source']['displayName'] ?? null, 1, self::MAX_SOURCE_DISPLAY_NAME_CODE_POINTS);
                $effectiveFeedDate = self::timestamp($supportData['effectiveFeedDate'] ?? null);
                $originalUrl = self::originalUrl($supportData['originalUrl'] ?? null);
                if ($articleId === null || $headline === null || $sourceDisplayName === null || $effectiveFeedDate === null || $originalUrl === null) return null;
                $supports[] = new DistributionDigestSupport($articleId, $headline, $sourceDisplayName, $effectiveFeedDate, $originalUrl);
            }
            $highlights[] = new DistributionDigestHighlight($title, $explanation, $supports);
        }
        return new DistributionDigest($generatedAt, $freshness, $inputArticleCount, $provider, $model, $overview, $highlights);
    }

    /** @return array<string, mixed> */
    public static function toArray(DistributionDigest $digest): array
    {
        return [
            'generatedAt' => $digest->generatedAt,
            'freshness' => $digest->freshness,
            'inputArticleCount' => $digest->inputArticleCount,
            'provider' => $digest->provider,
            'model' => $digest->model,
            'overview' => $digest->overview,
            'highlights' => array_map(static fn (DistributionDigestHighlight $highlight): array => [
                'title' => $highlight->title,
                'explanation' => $highlight->explanation,
                'supportingArticles' => array_map(static fn (DistributionDigestSupport $support): array => [
                    'articleId' => $support->articleId,
                    'headline' => $support->headline,
                    'source' => ['displayName' => $support->sourceDisplayName],
                    'effectiveFeedDate' => $support->effectiveFeedDate,
                    'originalUrl' => $support->originalUrl,
                ], $highlight->supportingArticles),
            ], $digest->highlights),
        ];
    }

    private static function text(mixed $value, int $minimum, int $maximum): ?string
    {
        if (!is_string($value)) return null;
        $length = self::length($value);
        return $length >= $minimum && $length <= $maximum ? $value : null;
    }

    private static function length(string $value): int
    {
        $count = preg_match_all('/./us', $value);
        return $count === false ? -1 : $count;
    }

    private static function timestamp(mixed $value): ?string
    {
        if (!is_string($value) || strlen($value) > 128 || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/D', $value) !== 1) return null;
        $normalized = str_ends_with($value, 'Z') ? substr($value, 0, -1) . '+00:00' : $value;
        if (strpos($normalized, '.') === false) $normalized = substr($normalized, 0, 19) . '.000000' . substr($normalized, 19);
        else {
            $zone = strpos($normalized, '+', 19);
            if ($zone === false) $zone = strpos($normalized, '-', 19);
            if ($zone === false) return null;
            $normalized = substr($normalized, 0, 20) . str_pad(substr($normalized, 20, $zone - 20), 6, '0') . substr($normalized, $zone);
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.uP', $normalized);
        $errors = \DateTimeImmutable::getLastErrors();
        return $date !== false && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0)) ? $value : null;
    }

    private static function originalUrl(mixed $value): ?string
    {
        $url = self::text($value, 1, 8_192);
        if ($url === null || filter_var($url, FILTER_VALIDATE_URL) === false) return null;
        $scheme = parse_url($url, PHP_URL_SCHEME);
        return in_array($scheme, ['http', 'https'], true) ? $url : null;
    }
}
