<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

use NewsScraper\Integration\Php\FallbackHtmlRenderer;
use NewsScraper\Integration\Php\LocalProfileReader;
use NewsScraper\Integration\Php\LocalReadConfiguration;

header('Content-Type: text/html; charset=UTF-8');

try {
    $configuration = LocalReadConfiguration::fromEnvironment($_ENV + $_SERVER);
    $content = (new FallbackHtmlRenderer())->render((new LocalProfileReader($configuration))->read());
} catch (Throwable) {
    // The visitor boundary deliberately exposes no local configuration or state details.
    $content = '<section class="news-scraper-fallback" aria-label="News"><p class="news-scraper-unavailable" role="status">Local content is temporarily unavailable.</p></section>';
}

echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Local news</title></head><body>' . $content . '</body></html>';
