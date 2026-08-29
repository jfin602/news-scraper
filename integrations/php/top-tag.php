<?php

declare(strict_types=1);

require_once __DIR__ . '/local-read.php';

use NewsScraper\Integration\Php\LocalReadResult;

function news_scraper_top_tag_escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

function news_scraper_top_tag_time(string $value): string
{
    try {
        return (new DateTimeImmutable($value))->format('M j, Y g:i A T');
    } catch (Throwable) {
        return $value;
    }
}

header('Content-Type: text/html; charset=UTF-8');

try {
    // This is the one normalized local-read setup for both editable blocks.
    $result = news_scraper_local_read();
} catch (Throwable) {
    $result = null;
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>News</title>
</head>
<body>
<?php if ($result === null): ?>
    <p role="status">Local content is temporarily unavailable.</p>
<?php elseif (!$result->isRenderable()): ?>
    <p role="status"><?php
        echo news_scraper_top_tag_escape(match ($result->state) {
            LocalReadResult::NEVER_SYNCED => 'Local content is initializing.',
            LocalReadResult::STALE_CUTOFF => 'Local content is unavailable because it is too old.',
            LocalReadResult::DISABLED => 'This Profile is currently disabled.',
            default => 'Local content is temporarily unavailable.',
        });
    ?></p>
<?php else: ?>
    <header>
        <h1><?php echo news_scraper_top_tag_escape($result->profile->displayName); ?></h1>
        <p><?php echo news_scraper_top_tag_escape($result->publication->name); ?></p>
        <?php if ($result->state === LocalReadResult::STALE_USABLE): ?>
            <p role="status">Local content is stale.</p>
        <?php endif; ?>
    </header>

    <!-- OPTIONAL AI DIGEST SECTION: copy, move, restyle, or remove this block. -->
    <?php if ($result->digest !== null): ?>
        <section class="ns-digest" aria-label="AI news summary">
            <h2>AI News Summary</h2>
            <p>This summary is AI-generated.</p>
            <p>
                Generated <time datetime="<?php echo news_scraper_top_tag_escape($result->digest->generatedAt); ?>"><?php echo news_scraper_top_tag_escape(news_scraper_top_tag_time($result->digest->generatedAt)); ?></time>.
                <?php if ($result->digest->freshness === 'older'): ?>
                    This summary reflects an older, still-valid set of articles.
                <?php else: ?>
                    This summary reflects the current set of articles.
                <?php endif; ?>
            </p>
            <p class="ns-digest-overview"><?php echo news_scraper_top_tag_escape($result->digest->overview); ?></p>
            <?php foreach ($result->digest->highlights as $highlight): ?>
                <section class="ns-digest-highlight">
                    <h3><?php echo news_scraper_top_tag_escape($highlight->title); ?></h3>
                    <p><?php echo news_scraper_top_tag_escape($highlight->explanation); ?></p>
                    <?php if ($highlight->supportingArticles !== []): ?>
                        <h4>Supporting Articles</h4>
                        <ul>
                        <?php foreach ($highlight->supportingArticles as $support): ?>
                            <li>
                                <a href="<?php echo news_scraper_top_tag_escape($support->originalUrl); ?>"><?php echo news_scraper_top_tag_escape($support->headline); ?></a>
                                <span><?php echo news_scraper_top_tag_escape($support->sourceDisplayName); ?></span>
                            </li>
                        <?php endforeach; ?>
                        </ul>
                    <?php endif; ?>
                </section>
            <?php endforeach; ?>
        </section>
    <?php endif; ?>
    <!-- END OPTIONAL AI DIGEST SECTION -->

    <!-- ARTICLE FEED SECTION: this normal Article path does not depend on a digest. -->
    <section class="ns-articles" aria-label="News articles">
        <h2>Articles</h2>
        <?php if ($result->articles === []): ?>
            <p role="status">No articles are currently available.</p>
        <?php else: ?>
            <ol>
            <?php foreach ($result->articles as $article): ?>
                <li class="ns-article">
                    <article>
                        <h3><a href="<?php echo news_scraper_top_tag_escape($article->originalUrl); ?>"><?php echo news_scraper_top_tag_escape($article->headline); ?></a></h3>
                        <p>Source: <?php echo news_scraper_top_tag_escape($article->source->displayName); ?></p>
                        <?php if ($article->summary !== null): ?>
                            <p><?php echo news_scraper_top_tag_escape($article->summary); ?></p>
                        <?php endif; ?>
                        <?php if ($article->categories !== []): ?>
                            <p>Categories:
                            <?php foreach ($article->categories as $category): ?>
                                <span><?php echo news_scraper_top_tag_escape($category->displayName); ?></span>
                            <?php endforeach; ?>
                            </p>
                        <?php endif; ?>
                    </article>
                </li>
            <?php endforeach; ?>
            </ol>
        <?php endif; ?>
    </section>
    <!-- END ARTICLE FEED SECTION -->
<?php endif; ?>
</body>
</html>
