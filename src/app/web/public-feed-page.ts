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
