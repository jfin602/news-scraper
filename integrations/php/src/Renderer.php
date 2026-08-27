<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

/**
 * Presentation-only extension point for the normalized Phase 6 local result.
 *
 * Implementations do not receive a store, filesystem path, client, or
 * synchronization service. Customers may use this interface, or consume the
 * LocalReadResult directly and bypass the fallback altogether.
 */
interface LocalProfileRenderer
{
    public function render(LocalReadResult $result): string;
}

/**
 * Small dependency-free server-rendered reference presentation.
 *
 * This is intentionally not a router, controller, template engine, or
 * eligibility authority. All publisher/editorial values are escaped at their
 * final HTML output context, and images are omitted from the fallback.
 */
final class FallbackHtmlRenderer implements LocalProfileRenderer
{
    public function render(LocalReadResult $result): string
    {
        return match ($result->state) {
            LocalReadResult::USABLE, LocalReadResult::STALE_USABLE => $this->renderUsable($result),
            LocalReadResult::NEVER_SYNCED => $this->renderUnavailable('Local content is initializing.'),
            LocalReadResult::STALE_CUTOFF => $this->renderUnavailable('Local content is unavailable because it is too old.'),
            LocalReadResult::DISABLED => $this->renderUnavailable('This Profile is currently disabled.'),
            LocalReadResult::UNAVAILABLE => $this->renderUnavailable('Local content is temporarily unavailable.'),
            default => throw new \InvalidArgumentException('The local read state is invalid.'),
        };
    }

    private function renderUsable(LocalReadResult $result): string
    {
        if ($result->profile === null || $result->publication === null) {
            throw new \InvalidArgumentException('A renderable local result is missing its context.');
        }

        $html = '<section class="news-scraper-fallback" aria-label="News">';
        $html .= '<header class="news-scraper-context">';
        $html .= '<h1>' . $this->escape($result->profile->displayName) . '</h1>';
        $html .= '<p>' . $this->escape($result->publication->name) . '</p>';
        $html .= '</header>';
        $html .= $this->renderFreshness($result);

        if ($result->articles === []) {
            return $html . '<p class="news-scraper-empty" role="status">No articles are currently available.</p></section>';
        }

        $html .= '<ol class="news-scraper-articles">';
        foreach ($result->articles as $article) {
            $html .= $this->renderArticle($article);
        }
        return $html . '</ol></section>';
    }

    private function renderFreshness(LocalReadResult $result): string
    {
        if ($result->state === LocalReadResult::STALE_USABLE) {
            $age = $result->staleAgeSeconds ?? 0;
            return '<p class="news-scraper-freshness" role="status">Local content is stale (' . $age . ' seconds since the last successful sync).</p>';
        }
        return '<p class="news-scraper-freshness" role="status">Local content is fresh.</p>';
    }

    private function renderArticle(LocalReadArticle $article): string
    {
        $html = '<li class="news-scraper-article">';
        $html .= '<article>';
        $html .= '<h2><a href="' . $this->escape($article->originalUrl) . '">' . $this->escape($article->headline) . '</a></h2>';
        $html .= '<p class="news-scraper-source">Source: ' . $this->escape($article->source->displayName) . '</p>';
        $html .= '<p class="news-scraper-date"><time datetime="' . $this->escape($article->effectiveFeedDate) . '">' . $this->escape((new \DateTimeImmutable($article->effectiveFeedDate))->format('M j, Y')) . '</time></p>';

        if ($article->publishedAt !== null) {
            $html .= '<p class="news-scraper-published">Published: ' . $this->escape($article->publishedAt) . '</p>';
        }
        if ($article->author !== null) {
            $html .= '<p class="news-scraper-author">By ' . $this->escape($article->author) . '</p>';
        }
        if ($article->summary !== null) {
            $html .= '<p class="news-scraper-summary">' . $this->escape($article->summary) . '</p>';
        }
        if ($article->categories !== []) {
            $html .= '<p class="news-scraper-categories">Categories: ' . implode(', ', array_map(
                fn (LocalReadCategory $category): string => $this->escape($category->displayName),
                $article->categories,
            )) . '</p>';
        }

        return $html . '</article></li>';
    }

    private function renderUnavailable(string $message): string
    {
        return '<section class="news-scraper-fallback" aria-label="News"><p class="news-scraper-unavailable" role="status">' . $this->escape($message) . '</p></section>';
    }

    private function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    }
}
