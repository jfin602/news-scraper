<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use NewsScraper\Integration\Php\IntegrationRuntimeConfiguration;
use NewsScraper\Integration\Php\SynchronizationCommand;

try {
    $configuration = IntegrationRuntimeConfiguration::fromEnvironment([
        'NEWS_SCRAPER_BASE_URL' => getenv('NEWS_SCRAPER_BASE_URL'), 'NEWS_SCRAPER_PROFILE_KEY' => getenv('NEWS_SCRAPER_PROFILE_KEY'),
        'NEWS_SCRAPER_STATE_ROOT' => getenv('NEWS_SCRAPER_STATE_ROOT'), 'NEWS_SCRAPER_BEARER_TOKEN' => getenv('NEWS_SCRAPER_BEARER_TOKEN'),
        'NEWS_SCRAPER_SYNC_CADENCE_SECONDS' => getenv('NEWS_SCRAPER_SYNC_CADENCE_SECONDS'), 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS' => getenv('NEWS_SCRAPER_MAX_STALE_AGE_SECONDS'),
        'NEWS_SCRAPER_TIMEOUT_SECONDS' => getenv('NEWS_SCRAPER_TIMEOUT_SECONDS'), 'NEWS_SCRAPER_MAX_RESPONSE_BYTES' => getenv('NEWS_SCRAPER_MAX_RESPONSE_BYTES'),
    ]);
    exit(SynchronizationCommand::run($configuration, array_slice($argv, 1)));
} catch (\InvalidArgumentException $error) {
    fwrite(STDERR, "configuration_error " . $error->getMessage() . "\n");
    exit(2);
} catch (\Throwable) {
    fwrite(STDERR, "configuration_or_local_state_error\n");
    exit(2);
}
