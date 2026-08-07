# ADR: Topic-Independent Publication Model

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The initial customer needs a publishing-industry news feed aimed at independent authors. Similar future requests may target unrelated industries or subjects. Hard-coding indie-author terminology or rules into the collector would turn each new topic into a fork or rewrite.

## Decision

The software is a generic aggregation Platform. A **Publication** configuration owns topic description, branding, Categories, Relevance rules, Sources, Source priority, and public-feed settings.

Core engine modules use generic domain terms and must not branch on the initial Publication's identity or topic.

## Consequences

### Positive
- A second topic can be configured without rewriting collection logic.
- Tests can prove engine behavior independently from one customer's vocabulary.
- Publication-specific editorial changes do not require deployments.
- UI branding and Categories become reusable.

### Costs
- Publication scoping appears in the data model from the start.
- Data scoping, resource ownership validation, and uniqueness rules respect Publication boundaries.
- Configuration validation is more important than in a hard-coded single-topic site.

## Rejected alternatives

### Build only an indie-author scraper
Rejected because it creates topic coupling and weakens reuse.

### Build full commercial multi-tenancy immediately
Rejected for MVP because billing, self-service signup, tenant provisioning, native administrator accounts, and complex per-user role management are not required. Publication boundaries are implemented now without committing to a full SaaS control plane.

## Compliance check

A change violates this ADR when shared engine code introduces topic/Publication identity conditionals or embeds fixed publishing Categories outside Publication configuration/seed data.
