<?php

declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

use NewsScraper\Integration\Php\IntegrationConfigurationLoader;
use NewsScraper\Integration\Php\PackageMetadataReader;
use NewsScraper\Integration\Php\SynchronizationCommand;

try {
    $privateRoot = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'ns-private';
    $configuration = IntegrationConfigurationLoader::loadSynchronization(
        $privateRoot . DIRECTORY_SEPARATOR . 'local-read.env',
        $privateRoot . DIRECTORY_SEPARATOR . 'sync.env',
    );
    $metadata = PackageMetadataReader::read(__DIR__);
    exit(SynchronizationCommand::run($configuration, array_slice($argv, 1), $metadata->version));
} catch (\InvalidArgumentException $error) {
    fwrite(STDERR, "configuration_error " . $error->getMessage() . "\n");
    exit(2);
} catch (\Throwable) {
    fwrite(STDERR, "configuration_or_local_state_error\n");
    exit(2);
}
