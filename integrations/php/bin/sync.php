<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use NewsScraper\Integration\Php\CadenceDecision;
use NewsScraper\Integration\Php\IntegrationRuntimeConfiguration;
use NewsScraper\Integration\Php\IntegrationRuntimeFactory;
use NewsScraper\Integration\Php\SynchronizationResult;

$force = in_array('--force', array_slice($argv, 1), true);
if (count(array_filter(array_slice($argv, 1), static fn (string $argument): bool => $argument !== '--force')) > 0) {
    fwrite(STDERR, "configuration_error invalid CLI option\n");
    exit(2);
}
try {
    $configuration = IntegrationRuntimeConfiguration::fromEnvironment([
        'NEWS_SCRAPER_BASE_URL' => getenv('NEWS_SCRAPER_BASE_URL'), 'NEWS_SCRAPER_PROFILE_KEY' => getenv('NEWS_SCRAPER_PROFILE_KEY'),
        'NEWS_SCRAPER_STATE_ROOT' => getenv('NEWS_SCRAPER_STATE_ROOT'), 'NEWS_SCRAPER_BEARER_TOKEN' => getenv('NEWS_SCRAPER_BEARER_TOKEN'),
        'NEWS_SCRAPER_SYNC_CADENCE_SECONDS' => getenv('NEWS_SCRAPER_SYNC_CADENCE_SECONDS'), 'NEWS_SCRAPER_MAX_STALE_AGE_SECONDS' => getenv('NEWS_SCRAPER_MAX_STALE_AGE_SECONDS'),
        'NEWS_SCRAPER_TIMEOUT_SECONDS' => getenv('NEWS_SCRAPER_TIMEOUT_SECONDS'), 'NEWS_SCRAPER_MAX_RESPONSE_BYTES' => getenv('NEWS_SCRAPER_MAX_RESPONSE_BYTES'),
    ]);
    $result = IntegrationRuntimeFactory::create($configuration)->run($configuration->profileKey, $force);
    if ($result instanceof CadenceDecision) {
        fwrite(STDOUT, "not_due profile=" . $configuration->profileKey . "\n");
        exit(0);
    }
    $line = $result->facts->outcome . ' profile=' . $configuration->profileKey;
    if ($result->facts->failureCategory !== null) $line .= ' category=' . $result->facts->failureCategory;
    fwrite($result->facts->outcome === SynchronizationResult::FAILED ? STDERR : STDOUT, $line . "\n");
    exit($result->facts->outcome === SynchronizationResult::FAILED ? 1 : 0);
} catch (\InvalidArgumentException $error) {
    fwrite(STDERR, "configuration_error " . $error->getMessage() . "\n");
    exit(2);
} catch (\Throwable) {
    fwrite(STDERR, "configuration_or_local_state_error\n");
    exit(2);
}
