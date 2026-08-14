import type { Response } from 'express';

export const publicFeedPageContentSecurityPolicy =
  "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'";

const publicFeedPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Loading publication…</title>
    <script src="/public-theme.js"></script>
    <link rel="stylesheet" href="/public-feed.css">
    <script src="/public-feed.js" defer></script>
  </head>
  <body>
    <main class="public-feed-shell" data-publication-state="unresolved">
      <fieldset class="theme-control" data-theme-control>
        <legend>Theme</legend>
        <div class="theme-options">
          <label>
            <input type="radio" name="reader-theme" value="system" data-theme-option checked>
            <span>System</span>
          </label>
          <label>
            <input type="radio" name="reader-theme" value="light" data-theme-option>
            <span>Light</span>
          </label>
          <label>
            <input type="radio" name="reader-theme" value="dark" data-theme-option>
            <span>Dark</span>
          </label>
        </div>
      </fieldset>
      <header class="publication-masthead" data-publication-masthead hidden>
        <div class="publication-logo" data-publication-logo hidden></div>
        <div class="publication-identity">
          <h1 data-publication-name></h1>
          <p class="publication-description" data-publication-description hidden></p>
        </div>
      </header>
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
      <p class="feed-status" data-feed-status role="status" aria-live="polite">
        <span class="feed-loading-indicator" data-feed-loading-indicator aria-hidden="true"></span>
        <span data-feed-status-message>Loading publication…</span>
      </p>
      <section data-feed-content data-state="loading" aria-label="Latest headlines"></section>
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
