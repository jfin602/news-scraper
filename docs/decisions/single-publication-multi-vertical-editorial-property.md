# ADR: Single-Publication Multi-Vertical Editorial Property

**Status:** Accepted  
**Date:** 2026-08-27  
**Amends:** the narrow one-`Publication`/one-topic interpretation in `single-publication-simplified-data-model.md`, `headless-distribution-product-boundary.md`, and `managed-first-self-hostable-distribution-architecture.md`

## Context

News Scraper's singleton Publication model was originally described as one topic per deployed installation. That framing was useful while the first customer deployment represented only indie-author publishing news, but the real customer website is a broader editorial property that also needs independently presented opportunity and indie-filmmaking feeds.

Creating another Publication, tenant, database scope, or deployment merely because the same customer editorial property has several subject verticals would add architecture that the product does not need. The existing Distribution Profile model already provides the correct outward-selection boundary: Profiles can associate different Sources and bounded filters while all collection, normalization, persistence, provenance, moderation, duplicate handling, and canonical eligibility remain shared and governed.

The product therefore needs to preserve one Publication per installation while removing the unnecessary assumption that the Publication must represent one narrowly defined subject.

## Decision

Each deployed News Scraper installation still hosts exactly **one Publication**.

A Publication represents the installation's **customer/editorial property and governed content universe**, not necessarily one narrow topic. One Publication MAY contain multiple related subjects, verticals, sections, or feed concepts when they belong to that editorial property.

Distribution Profiles are the supported mechanism for exposing independently configured outward feeds within that singleton Publication. Profiles MAY use disjoint or overlapping Source membership and the existing bounded Profile filters. A Profile remains a post-canonical-eligibility selector and cannot change Source trust, collection admission, Relevance, Categories, moderation, Article identity, duplicate state, ordering, provenance, or `original_url` destination semantics.

For example, one customer Publication may legitimately contain Profiles such as:

```text
Publication: customer editorial property
├── publishing-news
├── opportunities
└── indie-filmmaking
```

Those Profiles do not create additional Publications, tenants, or relational ownership scopes.

Topic/subject independence remains a shared-engine rule. Subject vocabulary and subject-specific choices belong to configuration: Sources, Source admission settings, Categories, Relevance rules, Profile Source membership/filters, branding, presentation, and later governed Profile-level features. Shared engine code MUST NOT branch on publishing, filmmaking, opportunities, or any other customer subject.

A separate deployment remains appropriate for a distinct customer/editorial property or when independent operational/security/persistence boundaries are intentionally required. A mere difference in subject matter is no longer sufficient by itself to require a separate deployment.

## Data-model consequences

This decision **does not** reintroduce Publication tenancy.

The accepted singleton data model remains authoritative:

- at most one persisted Publication/settings record per installation;
- no Publication UUID/slug/foreign-key scope added to Source, Article, observation, Category, Relevance, duplicate, job, Profile, credential, or integration state merely for vertical separation;
- Source `config_key` remains installation-wide;
- Article identity remains Source-scoped;
- Categories and Relevance remain installation-wide configuration with their existing optional Source scope;
- duplicate relationships remain installation-wide;
- ordinary runtime/admin/Worker/distribution flows do not select among Publications;
- customer and managed-instance isolation remains an operational deployment boundary, not relational tenancy.

This amendment therefore requires no schema migration by itself. Any later feature that needs new persisted behavior must independently satisfy supported production-data migration rules.

## Distribution and integration consequences

Multiple subject feeds within one Publication reuse the existing Profile → v1 API → PHP synchronization/LKG → local-read/SSR chain.

Each Profile keeps its own governed selection and independent PHP snapshot/LKG state. Customer presentation may place several Profiles on one website, on separate pages, or in different sections without moving selection logic into PHP or customer templates.

The bundled reference `/` and `/api/feed` remain singleton-Publication reference consumers and do not become a multi-Profile routing system solely because the Publication may contain several verticals.

## Consequences

### Positive

- One customer can operate several subject feeds without duplicate News Scraper installations.
- The existing singleton/no-tenancy data model remains simple.
- Distribution Profiles become the explicit feed/section boundary they are already designed to be.
- Collection, provenance, moderation, duplicate handling, and canonical eligibility remain centralized.
- New subjects remain configuration rather than shared-engine code changes.
- The PHP/customer integration can reuse one package architecture across multiple Profile feeds.

### Costs and constraints

- Installation-wide Categories and Relevance rules remain shared configuration, so vertical-specific behavior must use existing Source scope and Profile selection rather than silently inventing per-vertical editorial authorities.
- Operators must keep Source/Profile naming and membership clear as a Publication's Source universe grows.
- A future request for genuinely independent Publications in one installation would still require a separate explicit multi-Publication architecture/data-model decision.

## Rejected alternatives

### One News Scraper deployment per subject vertical

Rejected as the default rule. Separate deployments remain available when isolation is wanted, but subject differences alone do not justify duplicating the customer's operational stack.

### Concurrent multi-Publication tenancy

Rejected. The requirement is multiple feeds/verticals for one editorial property, not tenant or Publication selection inside one database/runtime.

### Encode vertical identity on Articles

Rejected. Profiles select already-governed Articles by Source membership and bounded filters. Vertical identity is not Article identity or provenance.

### Put vertical selection in PHP/customer templates

Rejected because adapters and presentation must not become competing Article-selection authorities.

## Migration and compatibility effects

This ADR is a documentation/product-model amendment only.

- No package-version change is authorized by this decision alone.
- No schema or migration change is authorized.
- No existing Source, Article, Profile, credential, PHP state, or customer data is reinterpreted destructively.
- Existing Profiles remain valid.
- Existing single-subject installations remain valid as a special case of one editorial property with one subject focus.

## Compliance check

A future change violates this decision when it:

- reintroduces Publication IDs/slugs/FKs/scopes merely to distinguish feed verticals;
- requires a separate deployment solely because two Profiles cover different subjects within one customer editorial property;
- hard-codes subject-specific shared-engine behavior;
- lets a Profile or adapter redefine canonical trust, eligibility, moderation, duplicate, ordering, provenance, or destination semantics; or
- treats multiple Profile feeds as permission to create relational multi-Publication tenancy.
