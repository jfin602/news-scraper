# ADR: Headless Distribution Product Boundary

**Status:** Accepted  
**Date:** 2026-08-19  
**Amends:** product-surface interpretation of `docs/contracts/project-contract.md` Law 11 and the route-surface assumptions in the current public-feed/single-Publication documentation

## Context

News Scraper reached a supported `1.0.0` production baseline as a standalone single-Publication news website with an administrator control plane. Post-1.0 Phase 0 then implemented server-rendered root output at `1.0.1` so the first-party feed could be useful without client JavaScript.

The original client subsequently identified a broader and more valuable use case: News Scraper should collect, normalize, moderate, deduplicate, and distribute approved-source Article metadata into the client's existing website and potentially other supported publication surfaces. The client wants the aggregation core and administrator control plane to be the reusable product rather than requiring News Scraper to own the presentation of every public website that consumes the data.

The existing implementation already has a useful separation: the first-party `/` page and `GET /api/feed` consume the same canonical public-feed read boundary, while collection remains Worker-owned. The product decision therefore does not require discarding the existing frontend or redesigning the collection/data core.

## Decision

News Scraper is a **headless news aggregation and distribution Platform**.

The primary product boundary is:

```text
approved Sources
→ collection / fetch
→ parsing / normalization
→ Article-link policy / Relevance / Categories
→ Source-scoped identity / persistence / provenance
→ duplicate handling / moderation
→ canonical outward Article read semantics
→ supported distribution consumers
```

The protected administrator UI/API is the Platform's **control plane**.

The bundled first-party `GET /` public feed remains a supported **reference/standalone frontend**. It may be useful for direct deployments, demonstrations, diagnostics, and clients that want a dedicated public feed, but it is one consumer of the Platform core rather than the definition of the product.

The existing `GET /api/feed` remains a supported current JSON consumer/interface. This ADR does not yet declare it the permanent/versioned external integration API; that question belongs to the follow-up distribution/SEO architecture decision.

All outward consumers must reuse canonical Article-selection semantics. A delivery adapter must not invent competing rules for Source trust, Article visibility, duplicate suppression, ordering, moderation, or the reader destination merely because its transport differs.

### One Publication per installation remains unchanged

This product pivot does **not** reintroduce multi-Publication tenancy.

Each deployed installation still hosts exactly one Publication/topic. Topic independence continues to mean that another topic uses another configured deployment of the same shared codebase. Publication remains singleton editorial/configuration state rather than a relational ownership key.

One Publication may eventually expose multiple supported distribution consumers or consumer-specific bounded delivery configurations without becoming a multi-Publication database.

### Collection trust and distribution selection are separate

Source approval answers whether the Platform trusts and may collect from a Source. It does not answer whether every downstream consumer should receive every outward-eligible Article from that Source.

Future distribution profiles or equivalent bounded consumer configuration may select among already-governed outward-eligible Articles, but they must not weaken Source approval, Article visibility, duplicate suppression, provenance, or original-destination laws.

### Existing first-party public behavior is preserved

The `1.0.1` server-rendered reference frontend is retained. Its implementation work is not reverted merely because it is no longer the primary product identity.

Until a later distribution contract deliberately changes a current outward interface:

- `GET /` remains the supported bundled reference frontend;
- `GET /api/feed` remains the supported current JSON feed endpoint;
- both continue to share the canonical current outward/public read model;
- stored `original_url` remains the headline/reader destination;
- the existing public-feed/admin contract continues to govern those surfaces specifically.

Where existing documentation describes `/` as the Platform's canonical **product** or mandatory customer-visible surface, this ADR and the amended Project Contract narrow that wording: `/` is canonical only for the bundled reference frontend, not for every consuming client website.

## Deliberately unresolved at adoption

### Later decision — 2026-08-20

`managed-first-self-hostable-distribution-architecture.md` and `../contracts/distribution-and-integration-contract.md` now resolve the macro architecture: managed-first/self-hostable single-Publication instances, instance-owned control planes, post-eligibility Distribution Profiles, thin PHP/WordPress/RSS adapter families, custom-application consumption, customer presentation ownership, machine/admin separation, and last-known-good cache direction. This is a later amendment and does not rewrite what was known on 2026-08-19.

The later completed 2.0 architecture is now governed by `../contracts/distribution-and-integration-contract.md` and `../contracts/distribution-api-contract.md`. They resolve Profile selectors/persistence behavior, the v1 API, machine credentials, PHP/cache semantics, RSS status, Compose evaluation packaging, and link/SEO policy. This later resolution does not rewrite what was unknown on 2026-08-19.

At adoption, this ADR did not select or promise:

- server-side API integration as the primary delivery method;
- outbound RSS/Atom;
- JavaScript widgets;
- iframe embeds;
- CMS-specific plugins;
- CORS behavior;
- API keys/authentication/quotas/rate limits;
- distribution-profile persistence;
- exclude-self or source-exchange algorithms;
- link `rel` policy;
- backlink SEO benefit;
- canonical/sitemap ownership;
- analytics/referral tracking;
- cache/CDN behavior;
- push/webhook distribution.

Those questions required the later investigation. That investigation is complete, and the owner approved the replacement seven-phase roadmap on 2026-08-20. Current execution status is routed through `BOOT.md` and `docs/roadmap/post-1.0-roadmap.md`. This status correction does not rewrite what remained unresolved at this ADR's adoption.

## Consequences

### Positive

- The product matches the client's actual integration need without discarding the collection/data/admin investment.
- Presentation can remain owned by the consuming website when appropriate.
- The aggregation engine stays topic independent and reusable.
- Existing `/` and `/api/feed` behavior can remain supported rather than being rewritten immediately.
- Distribution methods can evolve behind one canonical Article-selection boundary.
- Source approval, provenance, moderation, and duplicate rules remain centralized instead of being copied into widgets/CMS integrations.

### Costs

- The post-1.0 frontend/SEO-centric roadmap is no longer the correct implementation sequence and must be replaced after research.
- Existing documentation that treated `/` as the product requires reinterpretation/alignment.
- External integration introduces future security, caching, API-compatibility, consumer-configuration, and observability questions that were not necessary for a single first-party frontend.
- SEO value depends on integration details and external search-engine behavior; the Platform must not claim guaranteed backlink benefit before those details are researched and governed.

## Rejected alternatives

### Keep the standalone website as the primary product and treat client integration as an ad hoc export

Rejected because it would make the client's primary use case secondary and encourage one-off integration paths outside the canonical Article-selection boundary.

### Remove the bundled public frontend immediately

Rejected because it is already implemented, useful, and can remain a thin consumer of the same core. Removing it provides no architectural benefit at this stage.

### Rebuild as a concurrent multi-Publication SaaS

Rejected because the new requirement concerns distribution from one configured Publication, not multiple topic tenants inside one database/runtime. The accepted singleton data-model decision remains correct.

### Make Source approval double as distribution membership

Rejected because trust/collection authorization and consumer-specific outward selection are different concerns. Conflating them would make later source-sharing or exclude-self behavior unsafe and difficult to reason about.

### Lock a widget/RSS/API solution before research

Rejected because the correct integration method depends on SEO, crawler, CMS, security, caching, and deployment requirements that have not yet been analyzed.

## Migration and compatibility effects

This decision itself is documentation/product-boundary work only.

- No schema change is authorized.
- No package version change is authorized.
- Existing supported customer data remains governed by the production-data compatibility ADR.
- Existing `1.0.1` runtime behavior remains supported.
- The unexecuted post-1.0 Phase 0 closeout and the later frontend-centric roadmap sequence are retired before further implementation versions are consumed.

Any later persistence change for distribution profiles or integration state must preserve supported production data and prove the supported forward upgrade in addition to migration from zero.

## Compliance check

A future change violates this ADR when it:

- requires every client to use the bundled first-party frontend as the only supported public presentation;
- creates a distribution adapter with its own competing Article eligibility, duplicate, moderation, or destination rules;
- treats Source approval as automatic membership in every consumer-specific distribution output;
- introduces multi-Publication tenancy merely to support multiple distribution consumers;
- bypasses normalized Article/provenance boundaries;
- silently replaces stored `original_url` as the reader destination;
- hard-codes indie-author/client-specific exchange logic in the shared engine; or
- implements distribution behavior outside the completed governing contracts or before the replacement roadmap authorizes it.
