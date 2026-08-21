# ADR: Managed-first, self-hostable distribution architecture

**Status:** Accepted  
**Date:** 2026-08-20  
**Extends:** `headless-distribution-product-boundary.md` and `single-publication-simplified-data-model.md`

## Context

The 2026-08-19 headless-product decision established News Scraper as a governed aggregation and distribution core, but deliberately left deployment shape, consumer profiles, adapter families, presentation ownership, machine access, and caching direction unresolved. Those macro boundaries must be stable before a replacement post-1.0 roadmap can be written.

This decision preserves one Publication/topic per installation and the supported production-data boundary. It does not claim that self-host packaging, Distribution Profiles, or the new adapters are implemented.

## Decision

News Scraper is **managed-first and self-hostable by design**. The managed service is the complete self-hostable product operated on a customer's behalf, not a distinct cloud-dependent product.

The architecture has four layers:

1. **Isolated News Scraper instance** — Web/Admin, Worker, PostgreSQL state, scheduler/jobs, configuration/secrets, and distribution interfaces.
2. **Instance-owned customer control plane** — Sources, endpoints, collection filters, Categories, Relevance, moderation, duplicates, health/operations, and Distribution Profiles.
3. **Distribution Profiles** — named, administrator-controlled outward selections over the singleton Publication's canonically eligible Articles.
4. **Thin integration adapters** — a generic PHP package plus cron, a WordPress plugin, RSS/Atom interoperability output, and custom applications consuming supported normalized distribution data.

### Instance isolation and portability

Each managed customer receives an independently bounded News Scraper instance. Multiple instances MAY share physical infrastructure, but runtime configuration, secrets, Publication/editorial state, persistence, Worker/scheduler/job ownership, administrator access, and machine integration credentials remain independently bounded.

This isolation does not create relational customer or Publication tenancy. Each instance still hosts exactly one Publication/topic. Self-hosting means deploying the complete stack so ordinary collection, administration, persistence, moderation, and distribution do not require a central News Scraper service. This ADR does not choose containers, orchestrators, service managers, installers, or supported operating systems.

### Control plane and Distribution Profiles

The News Scraper instance owns the authoritative control plane. Sources, endpoints, collection/admission configuration, polling, Categories, Relevance, Article and duplicate moderation, Distribution Profiles, and product-exposed operational configuration remain there.

A Distribution Profile is a first-class named outward view of one Publication's governed corpus. Selection occurs only after canonical outward eligibility and can only narrow it. A profile cannot resurrect unapproved Source content, hidden or archived Articles, visible non-Primary duplicate members, or any content rejected by the canonical moderation/eligibility boundary. Multiple profiles do not imply multiple Publications.

Every serializer and adapter consumes the same canonical profile/read-model authority. At adoption, JSON was the machine-transport direction while schema/version/path remained unresolved; the later-resolution section records the completed v1 decision. RSS/Atom derives from the same profile semantics and is not an independent query engine.

### Thin adapters and presentation ownership

PHP, WordPress, RSS/Atom, and custom integrations are consumers, not competing editorial authorities. Adapters MAY own connection and machine-credential configuration, synchronization, local caching, stale-on-error delivery, rendering, CSS/classes, fallback templates, and presentation extension points. They MUST NOT own Source trust, admission filtering, Relevance or Category semantics, Article or duplicate moderation, canonical eligibility, Primary selection, or Distribution Profile interpretation.

News Scraper owns governed selection, normalized distribution data, and stored `original_url` destination semantics. The customer owns HTML structure, CSS, typography, layout, cards/lists/tables, supported visible metadata choices, responsive presentation, placement, and custom UI. First-party PHP and WordPress rendering provides a safe functional fallback, never mandatory presentation; custom applications are first-class consumers.

### Authentication, reliability, and SEO direction

Human administrator authentication and machine distribution authentication are separate security boundaries. Machine credentials MUST NOT implicitly grant administrator capabilities.

At adoption, server-side PHP/WordPress periodic synchronization and LKG direction were selected while exact mechanics remained unresolved. The later contracts now make generic PHP required for 2.0 and govern complete snapshots, locking, retries, atomic activation, stale behavior, and credentials; WordPress is post-2.0.

First-party PHP and WordPress integrations SHOULD produce server-generated customer-page HTML with ordinary direct publisher anchors, without browser JavaScript for core feed links. Iframes are not a first-class SEO integration method, browser-side widgets are outside the initial integration set, and RSS/Atom alone does not make links part of customer-page HTML. News Scraper makes no guaranteed SEO or backlink-performance claim.

Cloudflare Access remains accepted for managed deployments. It is not mandatory for a self-hosted stack. The later 2.0 decision defers native/default self-host admin authentication and limits Compose use to controlled evaluation or an operator-protected perimeter.

## Later 2.0 resolution — 2026-08-20

The completed 2.0 contracts retain this ADR's history and refine it as follows: 2.0 requires the authenticated v1 Profile API and generic PHP complete-snapshot/LKG integration; establishes a standard-Linux VPS Docker Compose evaluation route; and keeps managed integration primary. WordPress, RSS/Atom, native/default self-host admin authentication, and autonomous public self-host production readiness are post-2.0. Exact behavior is owned by `../contracts/distribution-and-integration-contract.md` and `../contracts/distribution-api-contract.md`.

## Consequences

### Positive

- Managed operation and eventual self-hosting share one product architecture.
- Customer state and credentials remain isolated without reintroducing tenancy plumbing.
- One governed profile boundary prevents transport-specific eligibility drift.
- Customers can fully control presentation without rebuilding aggregation policy.
- Local last-known-good rendering limits customer-page dependence on live News Scraper availability.

### Costs

- At adoption, Profile/API/auth/cache/RSS/SEO/packaging details still required governed design; the later-resolution contracts completed that work.
- Multiple deployable instances require disciplined operational isolation even when infrastructure is shared.
- First-party adapters require compatibility and reliability proof across different hosting environments.

## Rejected alternatives

- **Rebuild as conventional multi-tenant SaaS now** — the requirement is isolated single-Publication instances, not relational tenancy.
- **Detached self-hosted admin UI against a mandatory central engine** — this is not complete-stack self-hosting.
- **Put editorial or feed configuration in adapters** — that creates competing control planes.
- **Implement adapter-specific eligibility or profile logic** — transports must not redefine governed selection.
- **Require a central cloud control plane** — ordinary operation must remain independently possible.
- **Require first-party presentation** — customers retain presentation ownership.

## Migration and compatibility effects

This is a documentation-only architectural decision. It authorizes no schema, API, credential, packaging, runtime, dependency, or version change. Future persistence work must preserve supported customer data and prove migration from the accepted Phase 20 baseline as well as migration from zero. Existing `GET /` and `GET /api/feed` behavior remains supported and is not declared to be the permanent external integration contract.

## Compliance checks

A future implementation must prove that profile selection follows canonical eligibility, all transports share that authority, adapters cannot restore ineligible rows, machine credentials lack admin capability, cache replacement is atomic/validated, presentation customization cannot redefine selection, and a claimed self-hosted deployment operates the complete ordinary stack without a mandatory central News Scraper service.
