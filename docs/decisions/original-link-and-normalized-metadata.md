# ADR: Original-Link Destination and Normalized Metadata

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The product aggregates headlines to help readers discover reporting from approved publishers. Replicating full Articles would change the product, complicate rights/freshness, and weaken Source attribution. At the same time, Sources expose different field names/formats.

## Decision

The public headline's primary destination is the stored original/canonical public Article URL associated with the normalized Article. The Platform must not substitute a different Article destination silently.

Source-specific parser output passes through a normalized Article-candidate contract before relevance evaluation, Article identity resolution, true-duplicate evaluation, persistence, or public display.

The Platform may store/display bounded feed-provided metadata such as title, author, date, excerpt, Categories, and image URL, subject to sanitization and policy. Source-derived normalized values are preserved separately from optional administrator display overrides.

## Consequences

### Positive
- Publishers receive the reader destination and clear attribution.
- Public feed remains simple.
- Downstream modules operate on stable normalized data.
- Source adapters evolve without changing feed rendering.
- Full-content copyright/freshness concerns are reduced.
- Administrator corrections do not destroy the latest normalized Source value.

### Costs
- Broken/changed external URLs affect reader experience.
- Rich onsite reading/search is limited.
- Normalization requires careful date, URL, markup, and override handling.

## Rejected alternatives

### Store/republish full Article bodies by default
Rejected because it is outside the discovery-feed MVP and requires a separate rights/content policy.

### Let each Source adapter write directly to Article/public-feed tables
Rejected because it leaks Source-specific behavior downstream and prevents consistent safety, identity, provenance, and deduplication.

## Compliance check

A change violates this ADR when a Source parser bypasses normalization, public content is treated as Platform-authored, admin edits destroy Source provenance, or the default headline action stops being the original Article destination without a superseding decision.
