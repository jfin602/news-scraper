# ADR: Topic-Independent Single-Publication Deployment Model

**Status:** Superseded  
**Date:** 2026-08-06  
**Amended:** 2026-08-11  
**Superseded:** 2026-08-11 by [`single-publication-simplified-data-model.md`](./single-publication-simplified-data-model.md)

## Historical context

The initial customer needs a publishing-industry news feed aimed at independent authors. Similar future requests may target unrelated industries or subjects. Hard-coding indie-author terminology or rules into the collector would turn each new topic into a rewrite.

The reusable requirement applies to the codebase, not to concurrent topic hosting. A deployed installation is intended to represent one coherent news product/topic. Supporting multiple independently selectable Publications inside one live installation would add routing, administration, scheduling, and deployment complexity that the product does not need.

## Historical decision

The software is a generic aggregation Platform whose shared engine remains topic independent. A **Publication** configuration owns topic description, branding, Categories, Relevance rules, Sources, Source priority, and public-feed settings.

Each deployed installation hosts exactly one Publication. Reuse for another subject means creating another configured deployment of the same codebase, not adding another concurrently hosted Publication to the existing installation.

Core engine modules use generic domain terms and must not branch on the configured Publication's identity or topic.

This ADR originally retained Publication as both the topic/configuration boundary and a relational ownership/scoping boundary. Stable Publication identifiers and slugs were therefore allowed to remain for configuration identity, persistence scoping, migration safety, fixtures, and operator tooling even though the deployment cardinality was one.

It also established the installation root `/` as the canonical customer-visible feed rather than `/publications/:publicationSlug` or another topic selector.

## Why it was superseded

The one-Publication-per-installation product decision remained correct, but retaining Publication tenancy throughout persistence created unnecessary IDs, joins, repository arguments, uniqueness scopes, provenance fields, tests, and future scheduler/admin/Relevance/duplicate complexity for a hosting mode the product explicitly does not support.

The superseding ADR preserves topic-independent configuration and separate deployments while removing Publication as a relational tenancy key.

## Historical consequences

### Positive

- A second unrelated topic could reuse the same engine through another deployment.
- Public URLs became simpler because the deployment itself identified the Publication.
- Tests could prove engine behavior independently from one customer's vocabulary.
- Publication-specific editorial changes remained configuration rather than shared-engine logic.

### Costs discovered during implementation

- Publication identity/scoping propagated through Source repositories, normalized candidate provenance, Articles, observations, feed queries, bootstrap, and future-phase planning.
- Single-Publication routing did not by itself remove multi-Publication-shaped persistence and ownership checks.
- Future phases would have continued to carry an unused tenant dimension unless corrected.

## Historical rejected alternatives

### Build only an indie-author scraper

Rejected because it creates topic coupling and weakens reuse.

### Host multiple topic Publications in one deployment

Rejected because topic independence is a code-reuse requirement, not a multi-tenant hosting requirement.

### Build full commercial multi-tenancy immediately

Rejected for MVP because billing, self-service signup, tenant provisioning, native administrator accounts, and complex per-user role management are not required.

## Current authority

This record is historical. Current single-Publication data-model and migration behavior is governed by [`single-publication-simplified-data-model.md`](./single-publication-simplified-data-model.md), `docs/contracts/project-contract.md`, and `docs/contracts/domain-and-data-contract.md`.
