<?php

require_once '/home1/mfinney1/ns-integration/local-read.php';

use NewsScraper\Integration\Php\LocalReadResult;

function ns_escape($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
}

function ns_date($value)
{
    try {
        return (new DateTimeImmutable((string) $value))->format('M j, Y');
    } catch (Throwable $error) {
        return (string) $value;
    }
}

function ns_favicon($url)
{
    $parts = parse_url((string) $url);

    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return null;
    }

    if ($parts['scheme'] !== 'http' && $parts['scheme'] !== 'https') {
        return null;
    }

    $origin = $parts['scheme'] . '://' . $parts['host'];

    if (isset($parts['port'])) {
        $origin .= ':' . $parts['port'];
    }

    return $origin . '/favicon.ico';
}

function ns_source_initial($source)
{
    $source = trim((string) $source);
    return $source === '' ? '•' : strtoupper(substr($source, 0, 1));
}

$newsScraperContent = '';
$newsScraperDigestContent = '';

try {
    $newsScraperResult = news_scraper_local_read();
} catch (Throwable $error) {
    $newsScraperResult = null;
}

/* =========================================================
   DIGEST
   ========================================================= */

if (
    $newsScraperResult !== null &&
    $newsScraperResult->isRenderable() &&
    $newsScraperResult->digest !== null
) {
    $digest = $newsScraperResult->digest;

    ob_start();
    ?>
    <article class="news-scraper-digest" aria-label="Publishing news brief">

        <header class="news-scraper-digest__header">

            <p class="news-scraper-digest__eyebrow">
                <span
                    class="news-scraper-digest__eyebrow-mark"
                    aria-hidden="true"
                ></span>
                Publishing News Brief
            </p>

            <p class="news-scraper-digest__overview">
                <?= ns_escape($digest->overview) ?>
            </p>

        </header>

        <?php if ($digest->highlights !== array()): ?>

            <div class="news-scraper-digest__themes">

                <?php foreach ($digest->highlights as $highlight): ?>

                    <section class="news-scraper-digest__highlight">

                        <div class="news-scraper-digest__highlight-content">

                            <h2 class="news-scraper-digest__highlight-title">
                                <?php
                                echo ns_escape(
                                    $highlight->title
                                );
                                ?>
                            </h2>

                            <p class="news-scraper-digest__highlight-text">
                                <?php
                                echo ns_escape(
                                    $highlight->explanation
                                );
                                ?>
                            </p>

                        </div>

                        <?php if ($highlight->supportingArticles !== array()): ?>

                            <div
                                class="news-scraper-digest__references"
                                aria-label="Supporting articles"
                            >

                                <?php foreach ($highlight->supportingArticles as $support): ?>

                                    <?php
                                    $favicon = ns_favicon($support->originalUrl);
                                    ?>

                                    <a
                                        class="news-scraper-digest__reference"
                                        href="<?= ns_escape($support->originalUrl) ?>"
                                    >

                                        <span
                                            class="news-scraper-digest__reference-icon"
                                            aria-hidden="true"
                                        >

                                            <span
                                                class="news-scraper-digest__reference-fallback"
                                            >
                                                <?= ns_escape(
                                                    ns_source_initial(
                                                        $support->sourceDisplayName
                                                    )
                                                ) ?>
                                            </span>

                                            <?php if ($favicon !== null): ?>

                                                <img
                                                    src="<?= ns_escape($favicon) ?>"
                                                    alt=""
                                                    loading="lazy"
                                                    decoding="async"
                                                    referrerpolicy="no-referrer"
                                                    onerror="this.remove()"
                                                >

                                            <?php endif; ?>

                                        </span>

                                        <span
                                            class="news-scraper-digest__reference-body"
                                        >

                                            <span
                                                class="news-scraper-digest__reference-source"
                                            >
                                                <?= ns_escape(
                                                    $support->sourceDisplayName
                                                ) ?>
                                            </span>

                                            <span
                                                class="news-scraper-digest__reference-headline"
                                            >
                                                <?= ns_escape(
                                                    $support->headline
                                                ) ?>
                                            </span>

                                        </span>

                                        <span
                                            class="news-scraper-digest__reference-arrow"
                                            aria-hidden="true"
                                        >
                                            ↗
                                        </span>

                                    </a>

                                <?php endforeach; ?>

                            </div>

                        <?php endif; ?>

                    </section>

                <?php endforeach; ?>

            </div>

        <?php endif; ?>

        <footer class="news-scraper-digest__footer">

            AI-assisted news brief · Updated

            <time datetime="<?= ns_escape($digest->generatedAt) ?>">
                <?= ns_escape(ns_date($digest->generatedAt)) ?>
            </time>

        </footer>

    </article>
    <?php

    $newsScraperDigestContent = (string) ob_get_clean();
}

/* =========================================================
   FEED
   ========================================================= */

ob_start();

if ($newsScraperResult === null) {
    ?>
    <section class="news-scraper-fallback" aria-label="News">
        <p class="news-scraper-unavailable" role="status">
            Local content is temporarily unavailable.
        </p>
    </section>
    <?php
} elseif (!$newsScraperResult->isRenderable()) {

    $message = 'Local content is temporarily unavailable.';

    if ($newsScraperResult->state === LocalReadResult::NEVER_SYNCED) {
        $message = 'Local content is initializing.';
    } elseif ($newsScraperResult->state === LocalReadResult::STALE_CUTOFF) {
        $message = 'Local content is unavailable because it is too old.';
    } elseif ($newsScraperResult->state === LocalReadResult::DISABLED) {
        $message = 'This news feed is currently unavailable.';
    }
    ?>
    <section class="news-scraper-fallback" aria-label="News">
        <p class="news-scraper-unavailable" role="status">
            <?= ns_escape($message) ?>
        </p>
    </section>
    <?php
} else {
    ?>
    <section class="news-scraper-fallback" aria-label="News">

        <header class="news-scraper-context">

            <h1>
                <?= ns_escape(
                    $newsScraperResult->profile->displayName
                ) ?>
            </h1>

            <p>
                <?= ns_escape(
                    $newsScraperResult->publication->name
                ) ?>
            </p>

        </header>

        <?php if ($newsScraperResult->state === LocalReadResult::STALE_USABLE): ?>

            <p
                class="news-scraper-freshness"
                role="status"
            >
                Local content is stale.
            </p>

        <?php endif; ?>

        <?php if ($newsScraperResult->articles === array()): ?>

            <p
                class="news-scraper-unavailable"
                role="status"
            >
                No articles are currently available.
            </p>

        <?php else: ?>

            <ol class="news-scraper-articles">

                <?php foreach ($newsScraperResult->articles as $article): ?>

                    <li class="news-scraper-article">

                        <article>

                            <h2>
                                <a href="<?= ns_escape($article->originalUrl) ?>">
                                    <?= ns_escape($article->headline) ?>
                                </a>
                            </h2>

                            <p class="news-scraper-source">
                                <?= ns_escape(
                                    $article->source->displayName
                                ) ?>
                            </p>

                            <p class="news-scraper-date">
                                <time
                                    datetime="<?= ns_escape(
                                        $article->effectiveFeedDate
                                    ) ?>"
                                >
                                    <?= ns_escape(
                                        ns_date(
                                            $article->effectiveFeedDate
                                        )
                                    ) ?>
                                </time>
                            </p>

                            <?php if ($article->summary !== null): ?>

                                <p class="news-scraper-summary">
                                    <?= ns_escape($article->summary) ?>
                                </p>

                            <?php endif; ?>

                        </article>

                    </li>

                <?php endforeach; ?>

            </ol>

        <?php endif; ?>

    </section>
    <?php
}

$newsScraperContent = (string) ob_get_clean();

?>
