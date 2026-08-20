# Distribution and Integration Contract

**Status:** Current approved architecture; implementation details pending  
**Adopted:** 2026-08-20

## Authority and terminology

A **Distribution Profile** is a first-class named, administrator-controlled outward selection over the singleton Publication's governed Article corpus. A **distribution consumer** receives supported normalized output. An **integration adapter** is a thin transport, synchronization, caching, or rendering layer for such a consumer.

The News Scraper instance and its control plane own Distribution Profiles and their interpretation. Multiple profiles belong to the one singleton Publication and do not create Publications, customers, or relational tenancy.

## Required ordering and transport independence

All distribution follows one direction:

```text
canonical outward eligibility
→ Distribution Profile selection
→ supported serializer/interface
→ thin adapter or custom consumer
→ customer presentation
```

Canonical eligibility first enforces Source trust/lifecycle, Article visibility, moderation, and ungrouped-or-Primary duplicate eligibility under the Article lifecycle contract. A profile MAY only narrow that result. It MUST NOT resurrect untrusted, hidden, archived, non-Primary, or otherwise ineligible Articles.

Every JSON, RSS/Atom, PHP, WordPress, and custom-application path MUST consume the same canonical Distribution Profile/read-model authority. A serializer or adapter MUST NOT implement independent Article SQL, selector interpretation, eligibility, Relevance, Category, moderation, duplicate, ordering, or destination semantics.

## Integration families

- **Generic PHP package plus cron:** periodically synchronizes supported normalized profile output, maintains a local last-known-good cache, and offers safe fallback server-side rendering plus customer extension points.
- **WordPress plugin:** provides the same thin synchronization/cache/rendering role within WordPress without becoming an editorial authority.
- **RSS/Atom interoperability output:** serializes the same governed profile result for compatible consumers; it is not a separate feed-selection engine and does not itself guarantee links rendered into customer-page HTML.
- **Custom applications:** are first-class consumers of the supported normalized distribution interface and may replace first-party presentation entirely.

JSON is the canonical first-party machine-transport direction for PHP and WordPress. The exact schema, envelope, version, and path are not defined here.

## Adapter responsibilities and prohibitions

Adapters MAY own connection settings, machine credentials, scheduled synchronization, local cache, stale-on-error behavior, rendering, CSS/classes, fallback templates, and documented presentation extension points.

Adapters MUST NOT own Source trust or admission, Relevance or Category semantics, Article or duplicate moderation, canonical eligibility, Primary selection, or Distribution Profile interpretation.

Human administrator authentication and machine distribution authentication are separate boundaries. Machine credentials MUST be limited to their intended integration capabilities and MUST NOT implicitly perform administrator operations.

## Presentation ownership

News Scraper owns Article eligibility, Source trust, Relevance, moderation, duplicate suppression, profile selection, normalized distribution data, and exact stored `original_url` destination semantics.

The consuming customer owns HTML structure, CSS, typography, layout, cards/lists/tables, supported visible metadata choices, responsive presentation, placement, and custom application/UI. First-party PHP and WordPress templates MUST provide a safe functional fallback and stable customization or normalized-data escape hatches. They MUST NOT be mandatory presentation.

## Reliability boundary

Server-side PHP and WordPress adapters SHOULD synchronize periodically rather than call News Scraper during every public request. Rendering SHOULD use a validated local last-known-good cache. Failed, invalid, or partial synchronization MUST NOT replace a valid cache; stale valid output SHOULD remain renderable when the latest synchronization fails.

Exact TTL, storage representation, locking, retry/backoff, and atomic replacement mechanism remain implementation decisions requiring focused proof.

## Link and SEO objective

First-party PHP and WordPress integrations SHOULD return server-generated customer-page HTML containing ordinary direct anchors to stored publisher `original_url` values without requiring browser JavaScript for core feed links. Iframes and browser widgets are not initial first-class integration methods. The Platform MUST NOT promise SEO or backlink performance.

Link `rel`, canonical tags, robots, sitemaps, analytics/tracking, reciprocal-link safeguards, and other SEO policy remain unresolved.

## Intentionally unresolved design

This contract does not define profile fields, selectors, persistence, URL/key format, exclude-self behavior, exact JSON/API schema or versioning, credential format/storage/rotation, public/private or authenticated RSS, cache mechanics, PHP APIs, WordPress blocks/shortcodes/hooks, CORS, quotas/rate limits, native self-hosted admin authentication, self-host packaging/OS support, analytics, redirect wrappers, or SEO algorithms/guarantees.

Implementation remains blocked until the remaining decisions are governed and an owner-approved replacement roadmap assigns work and versions.
