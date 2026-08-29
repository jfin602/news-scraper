<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class PackagePreflight
{
    /** @return array{version:string, checks:array<int, string>} */
    public static function run(string $packageRoot, string $privateRoot, bool $checkSynchronization): array
    {
        self::assertRuntime();
        $metadata = self::metadata($packageRoot);
        self::requiredFiles($packageRoot);

        try {
            $local = IntegrationConfigurationLoader::loadLocalRead($privateRoot . DIRECTORY_SEPARATOR . 'local-read.env');
        } catch (\Throwable) {
            throw new \InvalidArgumentException('local_config_invalid');
        }
        if ($checkSynchronization) {
            try {
                IntegrationConfigurationLoader::loadSynchronization($privateRoot . DIRECTORY_SEPARATOR . 'local-read.env', $privateRoot . DIRECTORY_SEPARATOR . 'sync.env');
            } catch (\Throwable) {
                throw new \InvalidArgumentException('sync_config_invalid');
            }
        }
        self::state($local);
        return ['version' => $metadata->version, 'checks' => $checkSynchronization ? ['package', 'runtime', 'local_config', 'sync_config', 'state'] : ['package', 'runtime', 'local_config', 'state']];
    }

    private static function metadata(string $packageRoot): PackageMetadata
    {
        try {
            return PackageMetadataReader::read($packageRoot);
        } catch (\Throwable) {
            throw new \InvalidArgumentException('package_metadata_invalid');
        }
    }

    private static function assertRuntime(): void
    {
        if (PHP_VERSION_ID < 80100 || !extension_loaded('json')) {
            throw new \InvalidArgumentException('runtime_unsupported');
        }
    }

    private static function requiredFiles(string $packageRoot): void
    {
        foreach (['run-sync.php', 'local-read.php', 'top-tag.php', 'preflight.php', 'src/bootstrap.php'] as $relative) {
            $path = $packageRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
            if (is_link($path) || !is_file($path) || !is_readable($path)) {
                throw new \InvalidArgumentException('package_files_missing');
            }
        }
    }

    private static function state(LocalReadConfiguration $configuration): void
    {
        $root = $configuration->stateRoot();
        if (is_link($root) || !is_dir($root) || !is_readable($root) || !is_writable($root)) {
            throw new \InvalidArgumentException('state_root_unusable');
        }
        $profiles = $root . DIRECTORY_SEPARATOR . 'profiles';
        if (!file_exists($profiles)) {
            // A new state root is valid. The scheduled synchronizer, not preflight,
            // creates its directories on its first successful activation.
            return;
        }
        if (is_link($profiles) || !is_dir($profiles) || !is_readable($profiles)) {
            throw new \InvalidArgumentException('state_root_unusable');
        }
        try {
            // Read-only inspection: no lock, sync, cache replacement, or directory creation.
            (new FilesystemProfileStateStore($root))->load($configuration->profileKey);
        } catch (\Throwable) {
            throw new \InvalidArgumentException('state_invalid');
        }
    }
}
