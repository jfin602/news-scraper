<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

/**
 * Bounded parser for the package's deliberately simple KEY=value files.
 *
 * This is configuration data, not a shell format: values are never expanded,
 * interpolated, quoted, or executed.
 */
final class EnvironmentFileLoader
{
    private const MAX_FILE_BYTES = 262_144;
    private const MAX_LINE_BYTES = 16_384;

    /** @return array<string, string> */
    public static function load(string $path): array
    {
        if ($path === '' || !is_file($path) || !is_readable($path)) {
            throw new \InvalidArgumentException('The configuration file is missing or unreadable.');
        }
        $size = filesize($path);
        if ($size === false || $size > self::MAX_FILE_BYTES) {
            throw new \InvalidArgumentException('The configuration file exceeds the supported size.');
        }
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new \InvalidArgumentException('The configuration file is missing or unreadable.');
        }
        if (str_contains($contents, "\0")) {
            throw new \InvalidArgumentException('The configuration file contains invalid control data.');
        }

        $values = [];
        foreach (preg_split('/\r\n|\n|\r/', $contents) as $lineNumber => $line) {
            if (strlen($line) > self::MAX_LINE_BYTES) {
                throw new \InvalidArgumentException('The configuration file contains an oversized line.');
            }
            if ($line === '' || str_starts_with(ltrim($line, " \t"), '#')) {
                continue;
            }
            if (preg_match('/^([A-Z][A-Z0-9_]*)=(.*)$/D', $line, $match) !== 1) {
                throw new \InvalidArgumentException('The configuration file contains malformed input on line ' . ($lineNumber + 1) . '.');
            }
            [, $key, $value] = $match;
            if (array_key_exists($key, $values)) {
                throw new \InvalidArgumentException('The configuration file contains a duplicate setting.');
            }
            if (preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value) === 1) {
                throw new \InvalidArgumentException('The configuration file contains invalid control data.');
            }
            $values[$key] = $value;
        }
        return $values;
    }
}

/**
 * Owns the asymmetric private-file configuration boundary.
 */
final class IntegrationConfigurationLoader
{
    /** @return array<string, string> */
    public static function localReadValues(string $localReadPath): array
    {
        return EnvironmentFileLoader::load($localReadPath);
    }

    public static function loadLocalRead(string $localReadPath): LocalReadConfiguration
    {
        $values = self::localReadValues($localReadPath);
        self::assertOnlyKeys($values, ['NEWS_SCRAPER_PROFILE_KEY', 'NEWS_SCRAPER_STATE_ROOT', 'NEWS_SCRAPER_SYNC_CADENCE_SECONDS', 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS']);
        return LocalReadConfiguration::fromEnvironment($values);
    }

    public static function loadSynchronization(string $localReadPath, string $syncPath): IntegrationRuntimeConfiguration
    {
        $localValues = self::localReadValues($localReadPath);
        self::assertOnlyKeys($localValues, ['NEWS_SCRAPER_PROFILE_KEY', 'NEWS_SCRAPER_STATE_ROOT', 'NEWS_SCRAPER_SYNC_CADENCE_SECONDS', 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS']);
        $local = LocalReadConfiguration::fromEnvironment($localValues);
        $syncValues = EnvironmentFileLoader::load($syncPath);
        self::assertOnlyKeys($syncValues, ['NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN', 'NEWS_SCRAPER_TIMEOUT_SECONDS', 'NEWS_SCRAPER_MAX_RESPONSE_BYTES', 'NEWS_SCRAPER_PROFILE_KEY', 'NEWS_SCRAPER_STATE_ROOT', 'NEWS_SCRAPER_SYNC_CADENCE_SECONDS', 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS']);
        self::validateLegacyAliases($localValues, $syncValues, $local);

        foreach (['NEWS_SCRAPER_BASE_URL', 'NEWS_SCRAPER_BEARER_TOKEN'] as $name) {
            if (!isset($syncValues[$name]) || $syncValues[$name] === '') {
                throw new \InvalidArgumentException('Missing required synchronization configuration: ' . $name . '.');
            }
        }
        return new IntegrationRuntimeConfiguration(
            $syncValues['NEWS_SCRAPER_BASE_URL'],
            $local->profileKey,
            $local->stateRoot(),
            $syncValues['NEWS_SCRAPER_BEARER_TOKEN'],
            $local->cadenceSeconds,
            $local->maximumStaleAgeSeconds,
            self::positiveInteger($syncValues['NEWS_SCRAPER_TIMEOUT_SECONDS'] ?? null, 20, 'timeout'),
            self::positiveInteger($syncValues['NEWS_SCRAPER_MAX_RESPONSE_BYTES'] ?? null, 2_097_152, 'response limit'),
        );
    }

    /** @param array<string, string> $localValues @param array<string, string> $syncValues */
    private static function validateLegacyAliases(array $localValues, array $syncValues, LocalReadConfiguration $canonical): void
    {
        $sharedKeys = ['NEWS_SCRAPER_PROFILE_KEY', 'NEWS_SCRAPER_STATE_ROOT', 'NEWS_SCRAPER_SYNC_CADENCE_SECONDS', 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS'];
        foreach ($sharedKeys as $name) {
            if (!array_key_exists($name, $syncValues)) continue;
            $candidate = $localValues;
            $candidate[$name] = $syncValues[$name];
            $legacy = LocalReadConfiguration::fromEnvironment($candidate);
            if (
                $legacy->profileKey !== $canonical->profileKey ||
                $legacy->stateRoot() !== $canonical->stateRoot() ||
                $legacy->cadenceSeconds !== $canonical->cadenceSeconds ||
                $legacy->maximumStaleAgeSeconds !== $canonical->maximumStaleAgeSeconds
            ) {
                throw new \InvalidArgumentException('Legacy shared synchronization configuration does not match local-read.env.');
            }
        }
    }

    private static function positiveInteger(?string $value, int $default, string $field): int
    {
        if ($value === null || $value === '') return $default;
        if (preg_match('/^[1-9][0-9]*$/D', $value) !== 1) {
            throw new \InvalidArgumentException('Invalid ' . $field . ' configuration.');
        }
        return (int) $value;
    }

    /** @param array<string, string> $values @param array<int, string> $allowed */
    private static function assertOnlyKeys(array $values, array $allowed): void
    {
        foreach (array_keys($values) as $name) {
            if (!in_array($name, $allowed, true)) {
                throw new \InvalidArgumentException('The configuration file contains an unsupported setting.');
            }
        }
    }
}

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
