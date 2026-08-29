<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

/** Package-owned installed-version boundary. It never reads customer state. */
final class PackageMetadata
{
    public function __construct(public readonly string $version)
    {
    }
}

final class PackageMetadataException extends \RuntimeException
{
}

final class PackageMetadataReader
{
    private const MAX_FILE_BYTES = 16_384;
    private const VERSION_PATTERN = '/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/D';

    public static function read(string $packageRoot): PackageMetadata
    {
        if ($packageRoot === '' || is_link($packageRoot) || !is_dir($packageRoot)) {
            throw new PackageMetadataException('Package metadata is unavailable.');
        }
        $version = trim(self::readFile($packageRoot . DIRECTORY_SEPARATOR . 'VERSION'));
        if (!self::validVersion($version)) {
            throw new PackageMetadataException('Package metadata is invalid.');
        }
        try {
            $metadata = json_decode(self::readFile($packageRoot . DIRECTORY_SEPARATOR . 'integration-package.json'), true, 16, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            throw new PackageMetadataException('Package metadata is invalid.');
        }
        if (!is_array($metadata) || array_is_list($metadata) ||
            ($metadata['name'] ?? null) !== 'news-scraper-php-integration' ||
            ($metadata['product'] ?? null) !== 'news-scraper' ||
            ($metadata['apiVersion'] ?? null) !== 'v1' ||
            !is_string($metadata['version'] ?? null) ||
            !self::validVersion($metadata['version']) ||
            !hash_equals($version, $metadata['version'])) {
            throw new PackageMetadataException('Package metadata is contradictory or invalid.');
        }
        return new PackageMetadata($version);
    }

    private static function readFile(string $path): string
    {
        if (is_link($path) || !is_file($path) || !is_readable($path)) {
            throw new PackageMetadataException('Package metadata is missing or unreadable.');
        }
        $size = filesize($path);
        if ($size === false || $size < 1 || $size > self::MAX_FILE_BYTES) {
            throw new PackageMetadataException('Package metadata is invalid.');
        }
        $contents = file_get_contents($path);
        if ($contents === false || str_contains($contents, "\0")) {
            throw new PackageMetadataException('Package metadata is unreadable.');
        }
        return $contents;
    }

    private static function validVersion(string $version): bool
    {
        return strlen($version) <= 128 && preg_match(self::VERSION_PATTERN, $version) === 1;
    }
}
