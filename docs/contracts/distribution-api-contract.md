# Distribution API Contract

**Status:** Current normative permanent machine-interface contract; 2.0 Article/Profile behavior is implemented and Phase 1 / `2.1.x` adds one compatible top-level digest field without changing required Article semantics  
**Adopted:** 2026-08-20  
**Updated:** 2026-08-28 for owner-approved Phase 1 Gemini digest propagation

## Interface and compatibility

```http
GET /api/v1/distribution/{profile_key}
GET /api/v1/distribution/{profile_key}?cursor=...
```

This is a permanent read-only interface. Immutable Profile `config_key` is explicit in the path; consumers cannot reconstruct selection through arbitrary Source, Category, or query parameters. Pagination uses opaque validated keyset cursors bound to the Profile and snapshot criteria under which they were issued.

`/api/v1` is a deliberate compatibility contract. Compatible additive fields are allowed. Removing or incompatibly reinterpreting a required field requires a future major path such as `/api/v2`. Existing `GET /api/feed` is not this interface.

## Response schema

Every `200` response contains `apiVersion`, `generatedAt`, opaque `snapshotRevision`, `profile` (`configKey`, `displayName`), `publication` (`name`), top-level `digest`, `items`, and nullable `nextCursor`.

Each item contains `articleId`, `headline`, `originalUrl`, `effectiveFeedDate`, `feedDateSource`; nullable `publishedAt`, `author`, `summary`, `imageUrl`; `source` (`configKey`, `displayName`); and `categories[]` (`configKey`, `displayName`). Nullable metadata is present as `null`; empty collections are `[]`. `originalUrl` is the exact stored destination.

The top-level `digest` field is always present on a successful Profile page and is either:

- a validated structured currently distributable Profile digest object; or
- `null` when no currently distributable digest exists or optional AI state cannot be safely materialized.

The digest object contains only bounded downstream rendering data:

- `generatedAt`;
- `freshness`, exactly `current` or `older`;
- bounded `inputArticleCount`;
- provider identity;
- model identity;
- bounded plain-text overview;
- up to three bounded structured highlights.

Each highlight contains a bounded plain-text title, bounded plain-text explanation, and up to three application-resolved supporting Articles. A supporting Article contains at minimum:

- `articleId`;
- headline;
- Source display name;
- `effectiveFeedDate`;
- exact stored `originalUrl`.

Supporting metadata and destinations are resolved from canonical governed Article data. Model-generated URLs, Source names, dates, or replacement headlines are never trusted as outward fields.

The API MUST NOT expose internal Source/endpoint state, canonical identity URL, duplicate mechanics, moderation/Relevance internals, Collection runs/observations, incidental database timestamps, private persistence identifiers, internal `digestInputIdentity`, digest-attempt identifiers/status/details, prompt text, URL Context diagnostics, raw provider payloads/metadata, AI administration configuration, or secrets.

Invalid optional AI state MUST fail open relative to ordinary Article delivery. If the Profile and Article state is otherwise valid but the active digest cannot be validated/materialized safely, return the valid Articles normally with `digest: null` and expose the AI integrity problem only through bounded operator diagnostics. Invalid AI state alone MUST NOT turn an otherwise valid Profile Article response into a `503`.

## Snapshot and conditional requests

Every result exposes `snapshotRevision`; every cursor is bound to it. Continuation MUST NOT mix incompatible revisions. If distribution output changes during traversal, return machine-readable `409 snapshot_changed`.

The active digest is part of outward Profile snapshot state. Activating a new digest, replacing the active digest, suppressing/removing it, or transitioning between `digest: null` and a digest object changes `snapshotRevision` even when the governed Article set is unchanged.

The same normalized `digest` value belongs to every page of one `snapshotRevision`. It is not page-1-only metadata. Repeating the small bounded object across continuation pages is intentional so every page carries the same complete-snapshot identity.

If the active digest changes during traversal, a continuation under the previous revision follows the ordinary `409 snapshot_changed` path. No separate digest race/cursor protocol is introduced.

ETag, `If-None-Match`, and `304` SHOULD use the same revision concept. `304` applies only to an unchanged initial request and does not replace pagination. Digest-visible state changes therefore invalidate the prior ETag in the same way as other outward Profile snapshot changes.

## Credentials and authorization

Clients send dedicated credentials only as `Authorization: Bearer <credential>`; query-string credentials are prohibited. Credentials use high-entropy cryptographic randomness, are shown plaintext only at creation, and are never persisted plaintext. Records contain non-secret lookup identity, secure verifier/digest, label, lifecycle/audit timestamps, optional expiry, revocation state, and `distribution:read`; overlapping rotation is supported.

Machine credentials MUST NOT authorize admin mutations. A valid local `distribution:read` credential may read any active Profile in the same isolated instance. 2.0 has no credential↔Profile permission matrix and no Profile-specific authenticated-but-forbidden `403` response. Production distribution requires HTTPS and errors MUST NOT reveal credential internals.

The additive scheduled digest does not expand `distribution:read` into interactive AI spending authority. Later interactive chat requires the separately governed AI authorization/capability, request-size, rate, and cost-abuse boundary from `ai-assistance-contract.md`.

## Responses, limits, and CORS

- `200`: success, including valid empty Article output and `digest: null`;
- `304`: unchanged initial conditional request;
- `400`: malformed request or invalid cursor;
- `401`: invalid, revoked, expired, or unusable credential;
- `404`: nonexistent Profile;
- `409 profile_disabled`: authoritative disabled state;
- `409 snapshot_changed`: inconsistent continuation revision;
- `429`: machine-readable rate limit with `Retry-After`;
- `503`: bounded required service/dependency failure, not merely invalid optional AI state.

Rate limiting is primarily per authenticated credential; invalid-auth abuse MAY additionally use IP/network protections. Billing-style quotas are not required for ordinary distribution reads.

The API supports server-to-server PHP and custom applications. Browser widgets/direct browser consumption are outside current scope, so permissive browser CORS is not a v1 requirement.
