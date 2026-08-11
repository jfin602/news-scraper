# ADR: Topic-Independent Single-Publication Deployment Model

**Status:** Accepted  
**Date:** 2026-08-06  
**Amended:** 2026-08-11

## Context

The initial customer needs a publishing-industry news feed aimed at independent authors. Similar future requests may target unrelated industries or subjects. Hard-coding indie-author terminology or rules into the collector would turn each new topic into a rewrite.

The reusable requirement applies to the codebase, not to concurrent topic hosting. A deployed installation is intended to represent one coherent news product/topic. Supporting multiple independently selectable Publications inside one live installation would add routing, administration, scheduling, and deployment complexity that the product does not need.

## Decision

The software is a generic aggregation Platform whose shared engine remains topic independent. A **Publication** configuration owns topic description, branding, Categories, Relevance rules, Sources, Source priority, and public-feed settings.

Each deployed installation hosts exactly one Publication. Reuse for another subject means creating another configured deployment of the same codebase, not adding another concurrently hosted Publication to the existing installation.

Core engine modules use generic domain terms and must not branch on the configured Publication's identity or topic.

The Publication entity remains the topic/configuration and ownership boundary in the data model. Stable Publication identifiers and slugs may remain for configuration identity, persistence scoping, migration safety, fixtures, and operator tooling, but they do not make multi-Publication hosting a supported deployment mode.

The canonical customer-visible feed is served at the installation root `/`. Public readers do not choose the Publication through `/publications/:publicationSlug` or another topic selector.

## Consequences

### Positive

- A second unrelated topic can reuse the same engine by deploying a separately configured installation.
- Public URLs are simpler because the deployment itself identifies the Publication.
- Scheduler, admin, and operational behavior can assume one installation-level Publication while preserving explicit resource ownership internally.
- Tests can prove engine behavior independently from one customer's vocabulary.
- Publication-specific editorial changes remain configuration changes rather than shared-engine changes.
- The existing Publication-owned data model remains useful and does not need to be flattened into topic-specific tables or constants.

### Costs

- Running two topics requires two application deployments rather than one shared multi-Publication host.
- Deployment/bootstrap/runtime configuration must identify one canonical Publication unambiguously.
- Existing pre-production slug-addressed public routing must be corrected before Phase 10 implementation proceeds.

## Rejected alternatives

### Build only an indie-author scraper

Rejected because it creates topic coupling and weakens reuse.

### Host multiple topic Publications in one deployment

Rejected because topic independence is a code-reuse requirement, not a multi-tenant hosting requirement. Concurrent Publication selection would introduce unnecessary public routing, scheduler scoping, administration, and operational complexity.

### Remove the Publication abstraction entirely

Rejected because Publication remains the correct generic owner for Sources, Categories, Relevance rules, branding, feed settings, Article scoping, and other topic-specific configuration. Single-Publication deployment cardinality does not make those ownership boundaries unnecessary.

### Build full commercial multi-tenancy immediately

Rejected for MVP because billing, self-service signup, tenant provisioning, native administrator accounts, and complex per-user role management are not required. The single-Publication deployment model deliberately avoids implying that architecture.

## Compliance check

A change violates this ADR when it:

- introduces topic/Publication identity conditionals into shared engine code;
- embeds fixed publishing Categories or editorial behavior outside Publication configuration/seed data;
- requires public readers to choose among Publications within one installation;
- adds runtime behavior whose purpose is concurrently hosting multiple topic Publications in one deployment; or
- removes useful Publication ownership/scoping merely because deployment cardinality is one.
