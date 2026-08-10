# ADR: Original-Link Destination and Normalized Metadata

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The product aggregates headlines to help readers discover reporting from approved publishers. Replicating full Articles would change the product, complicate rights/freshness, and weaken Source attribution. At the same time, Sources expose different field names/formats.

## Decision

The public headline's primary destination is the Article's stored `original_url`: the preserved absolute Source-provided Article destination produced by normalization. The Platform must not substitute a different Article destination silently.

`canonical_identity_url` is an identity-comparison/canonicalization field. It MUST NOT silently replace `original_url` as the public headline destination merely because tracking cleanup or other conservative identity normalization changed its representation. A future separately governed Source-derived public/canonical destination field may supersede this rule only through an explicit contract decision; no such field exists for Phase 8.

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
- Identity canonicalization cannot silently rewrite the reader-facing destination.

### Costs
- Broken/changed external URLs affect reader experience.
- Rich onsite reading/search is limited.
- Normalization requires careful date, URL, markup, and override handling.
- A Source that requires a distinct canonical public destination needs an explicit future field/contract rather than reusing the identity URL implicitly.

## Rejected alternatives

### Store/republish full Article bodies by default
Rejected because it is outside the discovery-feed MVP and requires a separate rights/content policy.

### Let each Source adapter write directly to Article/public-feed tables
Rejected because it leaks Source-specific behavior downstream and prevents consistent safety, identity, provenance, and deduplication.

### Use the canonical identity URL as the public destination by default
Rejected because identity cleanup exists to compare Source instances and may intentionally remove tracking/fragments without proving that the transformed URL is the Source's intended reader destination. The preserved `original_url` remains authoritative unless a separately governed public-destination field is introduced.

## Compliance check

A change violates this ADR when a Source parser bypasses normalization, public content is treated as Platform-authored, admin edits destroy Source provenance, the public headline stops using the stored `original_url` without a superseding decision, or `canonical_identity_url` is silently substituted as the public destination.
