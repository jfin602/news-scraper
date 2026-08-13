import type { Response } from 'express';

export const publicFeedPageContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

const publicFeedPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>News feed</title>
    <link rel="stylesheet" href="/public-feed.css">
    <script src="/public-feed.js" defer></script>
  </head>
  <body>
    <main class="public-feed-shell">
      <h1 data-publication-name>News feed</h1>
      <form data-discovery-form aria-label="Discover headlines">
        <div class="discovery-field">
          <label for="discovery-keyword">Keyword</label>
          <input id="discovery-keyword" name="q" type="search" data-discovery-keyword>
        </div>
        <div class="discovery-field">
          <label for="discovery-source">Source</label>
          <select id="discovery-source" name="source" data-discovery-source>
            <option value="">All sources</option>
          </select>
        </div>
        <div class="discovery-field">
          <label for="discovery-category">Category</label>
          <select id="discovery-category" name="category" data-discovery-category>
            <option value="">All categories</option>
          </select>
        </div>
        <div class="discovery-actions">
          <button type="submit">Search</button>
          <button type="button" data-discovery-reset>Reset</button>
        </div>
      </form>
      <p data-feed-status role="status" aria-live="polite">Loading the latest headlines.</p>
      <section data-feed-content aria-label="Latest headlines"></section>
    </main>
  </body>
</html>`;

export function sendPublicFeedPage(response: Response): void {
  response
    .set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': publicFeedPageContentSecurityPolicy,
      'X-Content-Type-Options': 'nosniff',
    })
    .status(200)
    .type('html')
    .send(publicFeedPage);
}
