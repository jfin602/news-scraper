# MVP Scope and Users

## 1. MVP objective

Deliver a dependable publication website and administrative control plane that continuously collects recent headlines from a whitelist of approved sources, suppresses true duplicates, and sends readers to the original article.

The MVP must prove two things:

1. The initial indie-author publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured without changing aggregation-engine business logic.

## 2. Primary users

### Public reader

A reader wants to quickly answer: “What relevant stories were published recently, where did they come from, and where can I read the original?”

The reader does not need an account in the MVP.

### Publication administrator

An administrator controls:

- publication identity and branding;
- approved sources and endpoints;
- collection frequency;
- categories and relevance rules;
- article visibility and corrections;
- duplicate-group corrections;
- source health and collection history.

### Operator/developer

An operator needs enough telemetry to diagnose source failures, parser changes, duplicate decisions, delayed collection, and failed jobs without inspecting the database manually.

## 3. Required MVP capabilities

### Public feed

The MVP MUST provide:

- a reverse-chronological rolling list of visible primary articles;
- publication date or a clearly defined fallback date;
- linked headline pointing to the original article URL;
- source name;
- responsive desktop and mobile layouts;
- category filtering;
- source filtering;
- basic keyword search;
- pagination or deterministic load-more behavior;
- light and dark presentation support;
- accessible external-link behavior.

### Administration

The MVP MUST provide:

- authenticated administrator access;
- publication configuration;
- source and endpoint create, edit, enable, disable, and manual-check operations;
- source-type and polling-frequency configuration;
- category and relevance-rule management;
- source health and collection-run history;
- article hide, restore, edit, pin, and category assignment controls;
- manual duplicate merge and split controls;
- a reason trail sufficient to explain how an article entered the feed.

### Collection engine

The MVP MUST provide:

- RSS and Atom collection;
- conditional HTTP fetching where supported;
- configurable polling;
- normalized article candidates;
- idempotent persistence;
- exact and canonical-URL duplicate checks;
- title/fingerprint duplicate candidate checks;
- isolated source failures;
- retry and backoff behavior;
- collection metrics and structured error records.

### HTML source support

Configurable HTML-listing extraction is an MVP capability only after the structured-feed path is stable. Browser automation is a fallback for sources that cannot be reliably fetched through ordinary HTTP and must not become the default collector.

## 4. Initial publication configuration

The first publication targets publishing-industry developments relevant to independent authors. Its source list, categories, keywords, exclusions, branding, and editorial settings are configuration data.

Suggested initial categories include:

- Platforms and Retailers
- Publishing Industry
- Author Business
- Marketing
- Audiobooks
- Artificial Intelligence
- Copyright and Legal
- Tools and Technology
- General

These names are not global platform categories.

## 5. Explicitly outside the MVP

Unless separately approved, the MVP excludes:

- full article-body republishing;
- AI-generated summaries or rewritten articles;
- public user accounts and personalized feeds;
- comments, reactions, or community features;
- newsletters and social-media publishing;
- native mobile applications;
- automated open-web source discovery;
- customer billing or self-service multi-tenant signup;
- multilingual translation;
- semantic event clustering of related but distinct coverage;
- legal determinations about fair use, licensing, or ownership;
- push delivery for sources that do not offer a supported push mechanism.

## 6. Quality targets

The MVP SHOULD be judged by:

- duplicate rate visible in the public feed;
- median delay between source publication and first successful collection;
- percentage of enabled sources collected successfully within their expected interval;
- frequency of administrator intervention;
- percentage of public links that resolve to the intended original article;
- ability to add a normal RSS source without code changes;
- ability to configure a non-publishing publication without engine changes.

No numerical service-level objective is locked in Phase 0; instrumentation must exist before targets are finalized.
