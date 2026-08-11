# MVP Scope and Users

## MVP objective

Deliver a dependable single-Publication website and administrative control plane that continuously collects recent headlines from a whitelist of approved Sources, persists Source instances idempotently, suppresses true duplicates, and sends readers to the original Article.

Delivery is demo-first. The first implementation milestone is a real vertical slice that collects approved RSS/Atom Sources, normalizes and persists Articles idempotently with provenance, and displays them in the public rolling feed. Full admin UX follows after that vertical slice is working.

The MVP must prove:

1. The initial indie-author Publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured and deployed from the same codebase without changing aggregation-engine business logic.

A deployed installation hosts exactly one Publication/topic. Topic independence is a reusable-code/configuration property, not a requirement for one live installation to host multiple selectable Publications or to carry dormant tenant keys throughout persistence.

## Primary users

### Public reader
A reader wants to answer quickly: “What relevant stories were published recently, where did they come from, and where can I read the original?” No account is required in MVP. The reader enters the site at the deployment root `/`; there is no public Publication/topic selector.

### Publication administrator/operator
An authorized operator controls:

- singleton Publication identity/branding/public and collection state;
- approved Sources/endpoints and their operational states;
- collection frequency;
- Categories and deterministic Relevance rules;
- Source priority;
- Article visibility/display overrides/categories;
- Duplicate review/group corrections;
- Source/endpoint health and Collection-run history.

MVP administrative UI/API routes are protected by Cloudflare Access as defined by the accepted admin-perimeter ADR. The application does not provide native administrator accounts, passwords/passkeys, sessions, roles, account recovery, per-user Publication authorization, or canonical internal administrator identity in MVP.

### Operator/developer
An operator needs telemetry to diagnose Source failures, parser changes, delayed collection, identity behavior, duplicate decisions, and failed jobs without manual database inspection.

## Required MVP capabilities

### Public feed
MVP MUST provide:

- a canonical public feed at the deployment root `/` for the installation's singleton Publication configuration;
- reverse-chronological rolling list of feed-eligible Articles;
- feed eligibility for visible ungrouped Articles and visible Primary Articles;
- publication date or clearly defined fallback date;
- linked headline pointing to the Article's stored `original_url`;
- Source name;
- responsive desktop/mobile layouts;
- Category filtering;
- Source filtering;
- basic keyword search;
- deterministic pagination/load-more;
- light/dark presentation;
- accessible external-link behavior.

The earlier tech-demo milestone may expose the core `Date | Headline | Source` feed before search, filters, final responsive polish, theming, duplicate grouping, or admin UI are complete; the roadmap defines the exact staged boundary. Phase 8 established the database-backed public read model/API, persisted the Article visibility state first consumed by public output, respected Publication `public_status` and Source trust/lifecycle gates, and used the canonical effective feed date (`published_at` with `first_seen_at` fallback) before Phase 9 added the basic customer-visible page. The post-Phase-9 single-Publication correction makes `/` canonical and removes obsolete Publication tenancy before Phase 10 implementation proceeds.

### Administration
MVP MUST provide, after the tech-demo vertical slice:

- Cloudflare Access-protected administrative UI/API routes with direct-origin bypass prevented by the supported deployment;
- configuration for the installation's singleton Publication settings;
- Source/endpoint create, update, approve/unapprove, enable/pause/disable, archive/state management, and manual-check operations;
- Source priority and approved-domain policy;
- Source-type/polling configuration;
- Category and include/exclude/categorize Relevance-rule management;
- separate operational state and derived endpoint health;
- Collection-run history and canonical outcome counts;
- Article hide/restore/display-override/category controls;
- Duplicate candidate review, merge, split, dismiss, and Primary selection;
- bounded configuration/moderation change history sufficient to explain material changes without requiring native administrator identity.

State-changing browser actions MUST use CSRF protection or an equivalent request-integrity control when introduced. Administrative commands MUST validate real resource relationships and domain invariants even though MVP has no per-user permission system.

### Collection engine
MVP MUST provide:

- RSS/Atom collection;
- conditional HTTP fetching where supported;
- configurable polling;
- pre-fetch/redirect SSRF and approved-domain validation;
- normalized Article candidates;
- Article observation provenance;
- idempotent Article identity/persistence;
- conservative true-duplicate candidate checks;
- isolated Source failures;
- bounded retry/backoff;
- Collection metrics and structured error records.

Before configurable Relevance rules exist, safe normalized candidates use the canonical empty-rule/default-include decision rather than bypassing the Relevance boundary.

### HTML Source support
Configurable HTML-listing extraction is an MVP capability only after structured-feed collection is stable. It uses the same adapter boundaries. Browser automation is a justified fallback only and not a default collector.

## Initial Publication configuration

The first deployment's singleton Publication configuration targets publishing-industry developments relevant to independent authors. Its Source list, Categories, Relevance rules, branding, and editorial settings are configuration data.

Suggested initial Categories:

- Platforms and Retailers
- Publishing Industry
- Author Business
- Marketing
- Audiobooks
- Artificial Intelligence
- Copyright and Legal
- Tools and Technology
- General

These are not global Platform Categories. They are installation-specific configuration for the first deployment and are not shared-engine behavior. Phase 3 bootstrap was limited to the minimum Publication/Source/endpoint configuration required by its historical roadmap boundary; later branding/feed, Category, and Relevance data are introduced in the phases that use them.

Initial singleton Publication/Source/endpoint configuration may be created through operator-maintained seed/bootstrap tooling before admin UI exists. Bootstrap approval is explicit operator approval, not an eligibility bypass or auto-discovery mechanism. Ordinary bootstrap remains create-if-absent and does not overwrite existing operator-managed state; before full Publication administration exists, the tech-demo path therefore uses the smallest explicit operator-controlled generic state transition needed to expose the Publication deliberately.

Forward bootstrap/deployment/runtime configuration does not resolve or select among Publication slugs. It supplies one singleton Publication configuration for the installation. Source `config_key` is installation-wide; endpoint `config_key` is Source-scoped. A different topic uses a different deployment/configuration of the same codebase.

## Explicitly outside MVP

Unless separately promoted:

- concurrent multi-topic/multi-Publication hosting within one deployed installation;
- relational Publication tenancy retained solely as future-proofing for such hosting;
- native application-managed administrator accounts/identity;
- application passwords/passkeys, login/logout sessions, account recovery, and administrator roles;
- Publication-aware per-user authorization and identity-linked audit attribution;
- full Article-body republishing;
- AI-generated summaries/rewrites;
- public user accounts/personalized feeds;
- comments/reactions/community features;
- newsletters/social publishing;
- native mobile apps;
- automated open-web Source discovery;
- customer billing/self-service tenancy;
- multilingual translation;
- semantic event clustering of related but distinct coverage;
- generic relevance boost/ranking scores;
- pinning/featured-story ordering;
- push/webhook Source adapters;
- automatic bulk retroactive Relevance reprocessing after every rule edit;
- legal determinations about fair use/licensing/ownership.

## Quality targets

MVP SHOULD be judged by:

- visible duplicate rate;
- median Source-publication to first-observation delay;
- percentage of enabled endpoints successfully collected within expected interval;
- frequency of operator intervention;
- percentage of public links resolving to intended original Article;
- ability to add an ordinary RSS/Atom Source without code changes once Source administration exists;
- ability to deploy a non-publishing Publication from the same codebase without aggregation-engine changes.

No numerical service-level objective is locked before production hardening; instrumentation precedes target-setting.
