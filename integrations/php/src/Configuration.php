<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class ClientConfiguration
{
    public readonly string $baseUrl;
    public readonly string $bearerCredential;
    public readonly int $timeoutSeconds;
    public readonly int $maxResponseBytes;

    public function __construct(
        string $baseUrl,
        string $bearerCredential,
        int $timeoutSeconds = 20,
        int $maxResponseBytes = 2_097_152,
    ) {
        $parts = parse_url($baseUrl);
        if (
            $parts === false ||
            ($parts['scheme'] ?? null) !== 'https' ||
            !isset($parts['host']) ||
            array_key_exists('user', $parts) ||
            array_key_exists('pass', $parts) ||
            array_key_exists('query', $parts) ||
            array_key_exists('fragment', $parts)
        ) {
            throw new \InvalidArgumentException('The News Scraper base URL must be an HTTPS URL without credentials or query state.');
        }
        if (preg_match('/[\x00-\x1f\x7f]/u', $baseUrl) === 1) {
            throw new \InvalidArgumentException('The News Scraper base URL is invalid.');
        }
        if ($bearerCredential === '' || strlen($bearerCredential) > 8192 || preg_match('/\s|[\x00-\x1f\x7f]/u', $bearerCredential) === 1) {
            throw new \InvalidArgumentException('The bearer credential is invalid.');
        }
        if ($timeoutSeconds < 1 || $timeoutSeconds > 120) {
            throw new \InvalidArgumentException('The request timeout is outside the supported bound.');
        }
        if ($maxResponseBytes < 1_024 || $maxResponseBytes > 16_777_216) {
            throw new \InvalidArgumentException('The response limit is outside the supported bound.');
        }

        $this->baseUrl = rtrim($baseUrl, '/');
        $this->bearerCredential = $bearerCredential;
        $this->timeoutSeconds = $timeoutSeconds;
        $this->maxResponseBytes = $maxResponseBytes;
    }
}
