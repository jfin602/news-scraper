# Phase 4 — Versioned v1 distribution API validation

## Result and identity

- Status: **Phase 4 GREEN — HUMAN REVIEW REQUIRED**.
- Exact pre-P1 Phase 4 base: `7bd9a01fdef802197dcf5bc0e2853079b215fe2b` (`Write Phase 4 closeout prompt`).
- P1: `b61a89bcb8ffcd73a47bcd4d7db8907d8681d970` (`1.4.1`).
- P2: `2054b5db273c0240756ce2b39f3466de6ddbb6c5` (`1.4.2`, current `HEAD`).
- Closeout candidate: that `HEAD` plus the uncommitted `package.json`, `src/app/web/distribution-api-router.ts`, and `test/integration/distribution-api-router.test.ts` executable diff whose Git binary-diff object identity is `eb46006ede11ee5fd52f90158968a76ceacd46a6`, plus this artifact. Human acceptance and commit remain required.
- Package version: `1.4.3`. No lockfile was created.
- Observed environment: Node `v24.11.1`; npm `11.6.2`; PostgreSQL client `18.3`; Playwright `1.56.1`.
- No migration/schema file changed in the exact `7bd9a01...HEAD` implementation range or the closeout worktree.

## Final validation

- `node scripts/run-tests.mjs --test-concurrency=1 test/integration/distribution-api-router.test.ts` — focused repair PASS: 7 tests in 1 suite passed; 0 failed/cancelled/skipped/todo.
- `npm run check` — PASS: format, lint, typecheck, and 514 tests in 34 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run test:security` — PASS: 11 tests passed; 0 failed/cancelled/skipped/todo.
- `npm run test:db` — PASS: 240 tests in 5 suites passed against real disposable PostgreSQL; 0 failed/cancelled/skipped/todo. An earlier invocation reached the shell's 120-second execution limit without producing a test result; the unchanged-tree 300-second invocation completed in 139.2 seconds and is the evidence-bearing run.
- `npm run test:browser` — PASS: 44 tests in 7 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run codex:phase:validate -- p1-4` — PASS: contiguous P1–P3, assigned versions `1.4.1`–`1.4.3`, supported model labels, and one final manual P3 closeout.
- `git diff --check 7bd9a01...HEAD` — PASS for the committed Phase 4 implementation range.
- `git diff --check` — PASS for the uncommitted closeout candidate before this artifact and again after it.

The source/static/unit/integration/security evidence is Levels 1–3. Full `test:db` is Level 4 evidence for persisted credential authentication, canonical Profile output, traversal, revision/lifecycle behavior, and the wider database regression surface. `test:browser` is Level 6 evidence for preserved bundled/admin browser surfaces. Recovery, live-Source, and deployment suites were not required: Phase 4 introduced no schema, persistence representation, collection adapter, PHP/LKG, or deployed external integration. Phase 7 retains Level 7/8 managed external release proof.

## Pass 1 — contract and evidence review

- Route and grammar: `createWebApp` mounts only the dedicated router at `/api/v1/distribution`; its only route is `GET /:profileKey`. `parseRequest` accepts only one optional `cursor`. Unknown/repeated/empty selector input is rejected with `400`; Phase 2 bounds Profile keys and opaque cursors. No Source, Category, search, limit, offset, sort, Publication, body, cookie, or alternate credential selector exists. `/` and `/api/feed` remain separate unchanged handlers.
- Thin composition: `createDistributionApiRuntime` constructs one process-lifetime `createMachineRequestGuard` and `createDistributionProfilePageService`. The call chain is HTTP router → Phase 3 guard → Phase 2 page service → explicit v1 serializer. Phase 4 contains no credential SQL/token/verifier/lifecycle/quota implementation and no Profile child-table SQL, Article eligibility/filter/Category/order/cursor/revision implementation.
- Stable wire schema: `DISTRIBUTION_API_VERSION` is `v1`. The serializer explicitly assembles every required envelope/item/source/category field, preserves exact `originalUrl`, renders absolute ISO timestamps, retains nullable fields as `null`, arrays as `[]`, and exhausted `nextCursor` as `null`. It does not spread persistence objects or expose canonical identity, lifecycle, moderation/Relevance, duplicate, provenance, credential, verifier, or SQL state.
- Outcomes: focused and database HTTP tests prove `200`, bodyless authenticated initial `304`, bounded `400`, generic `401`, non-readable missing/draft `404`, `409 profile_disabled`, `409 snapshot_changed`, `429` with positive integral `Retry-After`, and bounded `503`. There is no Profile-specific `403` or credential-to-Profile matrix.
- Revision/conditional behavior: HTTP ETags quote the Phase 2 `snapshotRevision`; no second revision authority exists. Weak/strong/list/wildcard matching follows the bounded tested policy. Only an initial authenticated active read can become `304`; cursor requests always serialize/traverse, and Phase 2 returns `snapshot_changed` before pages can mix revisions.
- Auth/rate/trust: runtime composition owns one long-lived guard. Phase 3 keys authenticated buckets by redacted credential ID and invalid authentication by the HTTP-owned network key; bearer text is never a key. Direct mode ignores forwarding headers. Trusted mode requires one loopback peer, one IP `X-Forwarded-For`, and, for production transport, exactly `X-Forwarded-Proto: https`; malformed, multi-hop, missing, or untrusted state fails before authentication.
- HTTPS/configuration: production startup requires `NEWS_SCRAPER_DISTRIBUTION_TRANSPORT=trusted_proxy_https` and `NEWS_SCRAPER_WEB_TRUSTED_PROXY=loopback`. Development/test defaults to local HTTP. Arbitrary forwarded proto cannot establish security, Node need not terminate public TLS, errors do not echo values, and no Cloudflare application dependency was added.
- Headers: machine responses carry `X-Content-Type-Options`; body responses are JSON; successes use `private, no-cache` for revalidation and errors use `private, no-store`. No permissive CORS header or reflected credential/header detail exists.
- Telemetry: one explicit `DistributionApiTelemetryEvent` records bounded Profile key, API version, status/outcome/classification, duration, item/continuation facts, and redacted credential identity when authenticated. It contains no Authorization/token/verifier/cursor/Article/SQL/header/visitor/click/referral data. Sink and duration-clock failures cannot corrupt the response.
- Preserved behavior: the complete ordinary, security, database, and browser matrices protect `/`, `/api/feed`, admin enablement/request integrity, Profile administration, Phase 2 reads, Phase 3 credentials, Worker/collection, idempotency/provenance/duplicates, exact publisher destinations, and topic independence.

## Pass 2 — independently derived adversarial review

Disposition 1 (protected by structure plus executed evidence) covers encoded/invalid/oversized Profile keys through Express plus canonical key validation; unknown/repeated/empty/oversized/tampered/wrong-Profile/current-position-invalid cursors; selector injection; missing/combined/malformed/oversized Authorization; ignored body/cookie credentials; exact page boundaries, empty/null/category shapes, unusual inert text, and explicit serialization; matching/nonmatching weak/strong/list/wildcard/bounded conditional headers; conditional requests after auth/rate/lifecycle checks and on cursor traversal; revision mutation; bodyless `304`; spoofed forwarding/proto/provider headers; IPv4/IPv6/mapped normalization; multi-hop/malformed proxy state; absent peer state; long-lived invalid-auth and independent credential buckets; auth-before-Profile lookup; generic revoked/expired behavior; production configuration failure; local HTTP tests; telemetry redaction/sink failure; and preserved public/admin routes without global Express proxy mutation.

Malformed percent encoding and unsupported methods are rejected boundedly by the HTTP framework and do not create an alternate machine route. Unexpected bodies and cookies are never read by the GET adapter. Process-local limiting is documented honestly and no cross-process quota claim is made.

Disposition 2 contained two bounded closeout defects: telemetry reported whether the request used a cursor instead of whether another page remained, and an injected clock could throw outside the bounded response/telemetry path. The closeout now derives continuation from `page.nextCursor`, safely samples duration time, preserves bounded `503` for invalid response time, and adds focused regression proof. No disposition 3 structural refactor or disposition 4 contract/architecture/new-scope problem was found.

## Pass 3 — structural review

`distribution-api-router.ts` is the single v1 transport/status/schema/header/telemetry owner. `distribution-api-runtime.ts` is the process-lifetime composition owner, while `distribution-request-context.ts` and `web-config.ts` centralize the narrow proxy/HTTPS decision. No global Express trust setting, generic versioning/auth role framework, compatibility wrapper, migration, new dependency, test-only production branch, dead alternative, or Phase 5 behavior was added. Tests primarily assert public wire/security/database/browser outcomes. Phase 2/3 producer ownership remains coherent and was not refactored for aesthetics.

The closeout made only the two bounded telemetry/clock repairs above. No Terra High refactor handoff occurred before this final run, and no unresolved structural finding remains.

## Phase 5 producer handoff

| Downstream-required capability | Owning implementation/export | Focused proof |
| --- | --- | --- |
| stable Profile-addressed v1 URL | `createWebApp` + `createDistributionApiRouter` | `test/integration/distribution-api-router.test.ts`; `test/database/distribution-api-http.test.ts` |
| bearer-only machine authentication | `createMachineRequestGuard` + `createDistributionApiRuntime` | `test/security/machine-authentication.test.ts`; runtime security and DB HTTP tests |
| exact v1 envelope/item/null/empty schema | explicit serializer in `distribution-api-router.ts` | router component test; DB HTTP test |
| active Profile page read | `createDistributionProfilePageService` | Phase 2 snapshot/page DB evidence; DB HTTP test |
| opaque cursor traversal | Phase 2 page service exposed by the v1 router | Phase 2 paging test; multi-page DB HTTP test |
| stable snapshot revision | `distributionSnapshotRevision` through page service | Phase 2 revision/paging proof; router/DB HTTP serialization |
| stale traversal `409 snapshot_changed` | Phase 2 typed outcome → `respondNonActive` | router mapping test; DB HTTP mutation proof |
| disabled `409 profile_disabled` | Phase 2 lifecycle outcome → `respondNonActive` | router mapping test; DB HTTP lifecycle proof |
| initial ETag/`304` | `quotedEtag`/`ifNoneMatchMatches` over Phase 2 revision | router conditional test; DB HTTP conditional proof |
| rate `429`/`Retry-After` | Phase 3 guard → v1 mapper | machine-auth security tests; router and DB HTTP quota tests |
| generic `401`/`400`/`404`/`503` | v1 transport mapper | router component test; DB HTTP lifecycle/failure proof |
| production HTTPS/configuration boundary | `parseWebConfig` + `createDistributionRequestContextResolver` | Web-config/request-context unit tests; runtime security test |
| bounded distribution telemetry | `DistributionApiTelemetryEvent` + runtime `writeEvent` sink | router integration test; runtime security and DB HTTP redaction proof |

Phase 5 can build a PHP client using the stable URL, bearer header, envelope, cursor, revision/ETag, response classes, and retry input without knowing database schema, token/verifier internals, Profile selectors, Article SQL, cursor payload structure, limiter implementation, or trusted-proxy internals.

## Safety conclusions and next step

Bearer plaintext, Authorization headers, verifier bytes, cursor payloads, Article payloads, SQL/connection details, and visitor analytics do not enter v1 telemetry or errors. Untrusted clients cannot spoof the invalid-auth key or production HTTPS state through forwarding headers. The only supported production topology is one local TLS-terminating proxy; multi-hop/CIDR topologies fail closed and require later explicit planning. Rate limiting remains bounded and process-local.

No unresolved blocker remains. This artifact does not perform conversational `/closeout` and does not advance the package to `1.5.0`. After owner review accepts and commits this exact candidate, conversational `/closeout` remains the separate owner step for the package-only Phase 5 baseline transition.
