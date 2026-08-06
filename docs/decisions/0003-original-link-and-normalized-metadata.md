# ADR 0003: Original-Link Destination and Normalized Metadata

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The product is intended to aggregate headlines and help readers discover reporting from approved publishers. Replicating full articles would change the product, complicate rights and freshness, and weaken source attribution. At the same time, every source exposes different field names and formats.

## Decision

The public headline's primary destination is the original article URL.

Source-specific parser output must pass through a normalized article-candidate contract before relevance evaluation, deduplication, persistence, or public display. The platform may store and display bounded feed-provided metadata such as title, author, date, excerpt, categories, and image URL, subject to sanitization and policy.

## Consequences

### Positive

- Publishers receive the reader destination and clear attribution.
- The public feed remains simple.
- Downstream modules operate on one stable schema.
- Source adapters can evolve without changing feed rendering.
- Full-content copyright and freshness concerns are reduced.

### Costs

- Broken or changed external URLs affect reader experience.
- Rich onsite reading and search are limited.
- Normalization requires careful date, URL, and markup handling.

## Rejected alternatives

### Store and republish full article bodies by default

Rejected because it is outside the discovery-feed MVP and would require a separate rights and content policy.

### Let each source adapter write directly to public-feed tables

Rejected because it leaks source-specific behavior into presentation and prevents consistent deduplication.

## Compliance check

A change violates this ADR when a source parser bypasses normalization, when public content is treated as platform-authored, or when the default headline action stops being the original article destination without a superseding decision.
