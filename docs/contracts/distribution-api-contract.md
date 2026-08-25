# Distribution API Contract

**Status:** Current normative 2.0 machine-interface contract; Phase 3 credential/authentication/security foundations, the Phase 4 v1 HTTP interface, the Phase 5 downstream generic PHP synchronization/LKG consumer, and Phase 6 local-state/customer integration are implemented without changing this v1 contract; Phase 7 qualifies the unchanged interface in the real managed integration path
**Adopted:** 2026-08-20

## Interface and compatibility

```http
GET /api/v1/distribution/{profile_key}
GET /api/v1/distribution/{profile_key}?cursor=...
```

This is a permanent read-only interface. Immutable Profile `config_key` is explicit in the path; consumers cannot reconstruct selection through arbitrary Source, Category, or query parameters. Pagination uses opaque validated keyset cursors bound to the Profile and snapshot criteria under which they were issued.

`/api/v1` is a deliberate compatibility contract. Compatible additive fields are allowed. Removing or incompatibly reinterpreting a required field requires a future major path such as `/api/v2`. Existing `GET /api/feed` is not this interface.

## Response schema

Every `200` response contains `apiVersion`, `generatedAt`, opaque `snapshotRevision`, `profile` (`configKey`, `displayName`), `publication` (`name`), `items`, and nullable `nextCursor`.

Each item contains `articleId`, `headline`, `originalUrl`, `effectiveFeedDate`, `feedDateSource`; nullable `publishedAt`, `author`, `summary`, `imageUrl`; `source` (`configKey`, `displayName`); and `categories[]` (`configKey`, `displayName`). Nullable metadata is present as `null`; empty collections are `[]`. `originalUrl` is the exact stored destination.

The API MUST NOT expose internal Source/endpoint state, canonical identity URL, duplicate mechanics, moderation/Relevance internals, Collection runs/observations, incidental database timestamps, or private persistence identifiers.

## Snapshot and conditional requests

Every result exposes `snapshotRevision`; every cursor is bound to it. Continuation MUST NOT mix incompatible revisions. If distribution output changes during traversal, return machine-readable `409 snapshot_changed`.

ETag, `If-None-Match`, and `304` SHOULD use the same revision concept. `304` applies only to an unchanged initial request and does not replace pagination.

## Credentials and authorization

Clients send dedicated credentials only as `Authorization: Bearer <credential>`; query-string credentials are prohibited. Credentials use high-entropy cryptographic randomness, are shown plaintext only at creation, and are never persisted plaintext. Records contain non-secret lookup identity, secure verifier/digest, label, lifecycle/audit timestamps, optional expiry, revocation state, and `distribution:read`; overlapping rotation is supported.

Machine credentials MUST NOT authorize admin mutations. A valid local `distribution:read` credential may read any active Profile in the same isolated instance. 2.0 has no credential↔Profile permission matrix and no Profile-specific authenticated-but-forbidden `403` response. Production distribution requires HTTPS and errors MUST NOT reveal credential internals.

## Responses, limits, and CORS

- `200`: success, including valid empty output;
- `304`: unchanged initial conditional request;
- `400`: malformed request or invalid cursor;
- `401`: invalid, revoked, expired, or unusable credential;
- `404`: nonexistent Profile;
- `409 profile_disabled`: authoritative disabled state;
- `409 snapshot_changed`: inconsistent continuation revision;
- `429`: machine-readable rate limit with `Retry-After`;
- `503`: bounded service/dependency failure.

Rate limiting is primarily per authenticated credential; invalid-auth abuse MAY additionally use IP/network protections. Billing-style quotas are not required.

2.0 supports server-to-server PHP and custom applications. Browser widgets/direct browser consumption are outside scope, so permissive browser CORS is not a v1 requirement.
