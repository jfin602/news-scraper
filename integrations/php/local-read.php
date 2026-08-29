<?php

declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

use NewsScraper\Integration\Php\IntegrationConfigurationLoader;
use NewsScraper\Integration\Php\LocalProfileReader;
use NewsScraper\Integration\Php\LocalReadResult;
use NewsScraper\Integration\Php\FilesystemProfileStateStore;
use NewsScraper\Integration\Php\PackageMetadataReader;

/**
 * Stable customer entrypoint for normalized, local-only Profile data.
 */
function news_scraper_local_read(): LocalReadResult
{
    $localReadPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'ns-private' . DIRECTORY_SEPARATOR . 'local-read.env';
    $configuration = IntegrationConfigurationLoader::loadLocalRead($localReadPath);
    $metadata = PackageMetadataReader::read(__DIR__);
    return (new LocalProfileReader($configuration, new FilesystemProfileStateStore($configuration->stateRoot(), new \NewsScraper\Integration\Php\NativeLocalFilesystem(), $metadata->version)))->read();
}
