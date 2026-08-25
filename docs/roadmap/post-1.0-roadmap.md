# Post-1.0 / 2.0 Roadmap

**Status:** ACTIVE — owner-approved 2.0 implementation roadmap.  
**Current package baseline:** `1.7.0`.
**Current implementation phase:** Phase 7 — Managed integration and 2.0 release qualification.
**Current task folder:** `p1-7`.
**Current Phase 7 prompt versions:** `1.7.<prompt>`.
**Terminal release target:** `2.0.0`.  
**Primary direction:** prove the managed headless distribution product through Distribution Profiles, the authenticated v1 API, generic PHP synchronization/LKG, and a real external customer-site integration.

## Roadmap activation

The accepted `1.0.0` customer launch established the first supported production schema/data baseline. Former post-1.0 Phase 0 P1 then shipped the server-rendered bundled/reference root at `1.0.1`.

Before the former Phase 0 P2 closeout executed, the owner approved the headless aggregation/distribution product pivot. That unexecuted P2 was retired and never reserved `1.0.2`. The subsequent 2.0 architecture/planning gate is now complete and the resulting contracts are authoritative.

On 2026-08-20 the owner approved this replacement seven-phase roadmap and explicitly removed Docker Compose/self-host packaging from the `2.0.0` completion gate. The product goal for 2.0 is to prove the managed integration model quickly and rigorously; self-host packaging remains a later product direction rather than release-blocking work.

Roadmap activation authorizes the version-only baseline transition from `1.0.1` to `1.1.0`. No retired Phase 0 version is reused.

Normal roadmap implementation may now resume through:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write p1-<phase>
→ Codex implementation prompts
→ final phase closeout prompt
→ human review
→ /closeout
→ /docs-review
→ /docs-apply
→ next phase
```

## Version lifecycle

All 2.0 development remains in the `1.x.x` series. The final release transition alone produces `2.0.0`.

```text
roadmap activation       1.1.0
Phase 1 prompts           1.1.1 ... 1.1.x
Phase 1 /closeout         1.2.0
Phase 2 prompts           1.2.1 ... 1.2.x
Phase 2 /closeout         1.3.0
Phase 3 prompts           1.3.1 ... 1.3.x
Phase 3 /closeout         1.4.0
Phase 4 prompts           1.4.1 ... 1.4.x
Phase 4 /closeout         1.5.0
Phase 5 prompts           1.5.1 ... 1.5.x
Phase 5 /closeout         1.6.0
Phase 6 prompts           1.6.1 ... 1.6.x
Phase 6 /closeout         1.7.0
Phase 7 prompts           1.7.1 ... 1.7.x
terminal /closeout        2.0.0
```

Post-1.0 runner grammar remains unchanged:

- Phase N folder: `docs/tasks/p1-N/`;
- exact task header: `TASK: Phase N / P<number> — <title>`;
- P<number> target version: `1.N.<number>`;
- exactly one final closeout prompt per phase;
- prompt numbers are contiguous from P1.

The terminal Phase 7 `/closeout` is a deliberate release exception to the ordinary non-terminal handoff. After the final Phase 7 tree has satisfied its durable release-validation gate, `/closeout` changes only top-level `package.json` from the final validated `1.7.x` candidate to `2.0.0`, creates no `1.8.0` or `2.0.1` successor baseline, and marks this roadmap complete.

## Required product path

The roadmap must deliver and prove this one end-to-end authority chain:

```text
approved Sources
→ collection / normalization / persistence
→ canonical outward eligibility
→ Distribution Profile
→ authenticated GET /api/v1/distribution/{profile_key}
→ scheduled generic PHP complete-snapshot synchronization
→ validated local last-known-good state
→ server-rendered external customer website
→ direct stored publisher originalUrl links
```

Every phase must preserve topic independence, one Publication per installation, approved-Source trust, idempotency/provenance, duplicate suppression, stored `original_url`, and the existing supported `/` plus `/api/feed` reference behavior.

## Phase 1 — Distribution Profile foundation (completed)

**Baseline:** `1.1.0`  
**Prompt versions:** `1.1.x`  
**Goal:** establish the persistent Profile/control-plane domain that every later distribution consumer depends on.

### Required scope

- production-safe migrations for Distribution Profiles and Profile↔Source associations;
- immutable Profile `config_key`;
- mutable display name;
- `draft` / `active` / `disabled` lifecycle;
- bounded result/history limit with the governed default;
- explicit Profile↔Source membership;
- association-level `include_any_phrases[]`, `exclude_any_phrases[]`, and `category_config_keys[]`;
- deterministic validation of the bounded filter vocabulary;
- activation requirements and disabled-state behavior;
- protected administrator application/API controls for Profile create/read/update/lifecycle and Source-association/filter management;
- appropriate admin presentation sufficient to operate Profiles safely;
- durable configuration/change history where required by existing admin conventions;
- supported production forward migration from the accepted baseline in addition to migration from zero.

### Boundaries

Phase 1 does **not** build the permanent distribution API, machine bearer credentials, PHP client/cache, WordPress, RSS/Atom, or self-host packaging.

Source configuration/collection remains singular and is never duplicated into a Profile. Profile filtering is post-eligibility distribution configuration and never becomes Article identity, Relevance, moderation, duplicate, or collection logic.

### Exit gate

An authorized administrator can safely create a draft Profile, configure its Source associations and bounded filters, activate it only when valid, disable it, and reload the exact persisted state. Database constraints/transactions preserve immutable keys and relationship integrity. Migration-from-zero and supported production-forward migration preserve all previously governed 1.x data.

The complete persisted/application Profile boundary required by Phase 2 is proven at the appropriate Level 2–4 evidence before Phase 1 closes.

### Next baseline

Green Phase 1 `/closeout` transitions only `package.json` to `1.2.0`.

**Closeout:** completed; the current baseline is `1.2.0`.

## Phase 2 — Canonical distribution read model

**Baseline:** `1.2.0`  
**Prompt versions:** `1.2.x`  
**Goal:** establish the single transport-independent Profile/read-model authority later consumed by the v1 API.

### Required scope

- separate canonical Article eligibility from reference-frontend `public_status`;
- preserve approved/active Source trust, Article visibility, ungrouped-or-Primary duplicate suppression, exact stored `original_url`, and canonical effective-date ordering;
- apply Profile Source membership and bounded filter semantics only after canonical eligibility;
- effective outward Category membership including moderation overrides;
- required normalized distribution Article fields needed by the v1 contract;
- bounded Profile result/history behavior;
- opaque keyset continuation position semantics;
- deterministic Profile/snapshot revision semantics sufficient to prevent mixed multi-page snapshots;
- a narrow service/repository/read-model boundary that later API code can consume without reimplementing SQL or business rules;
- preserve existing `/` and `/api/feed` behavior and their `public_status` gate.

### Boundaries

Phase 2 does not expose `/api/v1/distribution/...`, authenticate machines, or implement PHP.

Do not copy the existing `public-feed` query and then maintain a competing eligibility implementation. Refactor/evolve only as required to leave one governed canonical eligibility authority plus separate reference-public and Profile-selection consumers.

### Exit gate

Focused plus real-PostgreSQL evidence proves canonical eligibility, Profile filtering, ordering, Category semantics, bounded result behavior, pagination positions, revision behavior, and `public_status` independence. Existing `/` and `/api/feed` regressions remain green.

The producer handoff to Phase 4 must already expose every distribution query capability the HTTP layer needs; later API work must not invent Article SQL, Profile interpretation, ordering, or revision semantics.

### Next baseline

Green Phase 2 `/closeout` transitions only `package.json` to `1.3.0`.

**Closeout:** completed successfully; `/closeout` transitioned only `package.json` to `1.3.0`, which is the Phase 3 baseline.

## Phase 3 — Machine credentials and distribution security

**Baseline:** `1.3.0`  
**Prompt versions:** `1.3.x`  
**Goal:** implement the dedicated machine-authentication authority independently of the external API transport.

### Required scope

- high-entropy News Scraper-generated bearer credentials;
- one-time plaintext presentation at creation;
- non-secret lookup identity plus secure verifier/digest persistence;
- `distribution:read` capability;
- labels and lifecycle/audit timestamps;
- optional expiration;
- revocation;
- overlapping rotation;
- constant/bounded authentication behavior without internal-state leakage;
- no query-string credentials;
- protected administrator credential create/list/revoke/rotate controls;
- reusable Web/API authentication boundary for Phase 4;
- per-credential rate-limit foundation and invalid-auth abuse boundary appropriate to the contract;
- strict proof that machine credentials cannot authorize admin operations;
- production-data migration preservation for credential state introduced here.

### Boundaries

Initial 2.0 credentials are instance-scoped, not Profile-scoped. Do not create a credential↔Profile authorization matrix or Profile-specific `403` model.

This phase does not build the distribution HTTP route itself.

### Exit gate

Credential generation, verifier storage, authentication, expiry, rotation overlap, revocation, rate/abuse boundaries, and strict machine/admin separation are proven with focused security/integration/database evidence. Phase 4 can consume one tested authentication interface rather than inventing security logic in a route.

### Next baseline

Green Phase 3 `/closeout` transitions only `package.json` to `1.4.0`.

**Closeout:** completed successfully; `/closeout` transitioned only top-level `package.json` to `1.4.0`, which is the Phase 4 baseline.

## Phase 4 — Versioned v1 distribution API

**Baseline:** `1.4.0`  
**Prompt versions:** `1.4.x`  
**Goal:** expose the permanent authenticated machine interface by composing the Phase 2 read model and Phase 3 authentication boundary.

### Required scope

Implement:

```text
GET /api/v1/distribution/{profile_key}
GET /api/v1/distribution/{profile_key}?cursor=...
```

with:

- exact required v1 envelope and Article fields;
- stable nullable/empty field presence;
- immutable Profile key path addressing;
- no arbitrary Source/Category/q reconstruction parameters;
- opaque validated keyset cursors;
- cursor binding to Profile/snapshot revision;
- `snapshotRevision`;
- `ETag` / `If-None-Match` / `304` support as governed;
- `200`, `304`, `400`, `401`, `404`, `409 profile_disabled`, `409 snapshot_changed`, `429`, and `503` behavior;
- `Retry-After` for rate limits;
- bounded machine-readable errors without secrets/internal details;
- structured operational distribution telemetry;
- server-to-server-first CORS behavior with no requirement for permissive browser access;
- HTTPS production boundary/documented configuration behavior.

### Boundaries

The HTTP serializer/controller is thin. It must not reimplement Profile filters, canonical eligibility, Category semantics, duplicate suppression, cursor positions, revision generation, or Article query composition.

`GET /` and `GET /api/feed` remain supported legacy/reference surfaces and are not expanded into the new Profile API.

### Exit gate

The complete documented v1 contract passes focused HTTP/component/security tests plus applicable real-PostgreSQL query/revision evidence. Multi-page traversal cannot mix revisions. Invalid/disabled/missing/rate-limited/dependency states remain bounded. Existing public/admin regressions remain green.

A custom server-side consumer can use the v1 API without any PHP-specific behavior.

### Next baseline

Green Phase 4 `/closeout` transitions only `package.json` to `1.5.0`.

**Closeout:** completed successfully; conversational `/closeout` transitioned only top-level `package.json` to `1.5.0`, which is the Phase 5 baseline.

## Phase 5 — Generic PHP synchronization and last-known-good core

**Baseline:** `1.5.0`  
**Prompt versions:** `1.5.x`  
**Goal:** build the reusable PHP synchronization/cache core against the stable v1 API.

### Required scope

- PHP API client using bearer authentication;
- complete bounded Profile snapshot traversal through all cursors;
- v1 envelope/item/Profile/schema validation;
- `snapshotRevision` consistency checks;
- `snapshot_changed` candidate discard and bounded restart;
- ETag/conditional initial synchronization where available;
- customer-configurable cadence with 15-minute default;
- per-Profile locking and overlap prevention;
- bounded retries respecting `Retry-After`;
- candidate snapshot built separately from active state;
- atomic activation only after complete validation;
- prior recoverable valid state preserved where practical;
- independent local LKG state per Profile;
- no bearer credential inside cache payloads;
- freshness/staleness metadata;
- stale-valid rendering policy with no hard cutoff by default;
- optional customer maximum stale age;
- never-synced safe state;
- authoritative `profile_disabled` suppression semantics;
- successful-sync re-enable semantics;
- local operational sync/cache health.

### Boundaries

Phase 5 owns synchronization/cache correctness, not customer HTML presentation. Rendering must not be required to prove the synchronization engine.

The PHP client is thin and cannot implement Source trust, Profile selectors, Relevance, Category, moderation, duplicate, ordering, or destination rules.

### Exit gate

Deterministic PHP integration tests prove complete traversal, validation, locking, retry behavior, mixed/partial candidate rejection, atomic activation, LKG preservation, stale policy, never-synced behavior, authoritative disable, and re-enable. An upstream/network/API failure cannot corrupt or replace the active valid snapshot.

### Next baseline

Green Phase 5 `/closeout` transitions only `package.json` to `1.6.0`.

**Closeout:** completed successfully; conversational `/closeout` transitioned only top-level `package.json` from the accepted `1.5.4` candidate to `1.6.0`, which is the Phase 6 baseline.

## Phase 6 — PHP local data API and server-rendered customer integration

**Baseline:** `1.6.0`  
**Prompt versions:** `1.6.x`  
**Goal:** expose the stable local consumption surface and prove a customer-style website can render from synchronized local data without a visitor-path News Scraper request.

### Required scope

- normalized local Profile/Article access over the active PHP snapshot;
- customer-facing extension surface that does not require parsing cache internals;
- optional safe fallback server-rendered renderer;
- safe escaping and nullable metadata handling;
- populated, empty, never-synced, stale, stale-cutoff, disabled, and unavailable states;
- direct ordinary anchors to exact stored `originalUrl`;
- no JavaScript requirement for core Article links;
- no News Scraper tracking/redirect URL by default;
- customer-owned presentation override/escape hatch;
- no visitor-path live API call;
- lightweight customer-style/example integration harness suitable for Phase 7 deployment proof;
- visible local sync/cache health where useful to integrators/operators.

### Boundaries

Customer presentation may replace the fallback renderer but cannot reinterpret upstream eligibility, filtering, deduplication, ordering, or destinations.

Do not build WordPress, RSS/Atom, click analytics, browser widgets, or advanced SEO tooling.

### Exit gate

Server/browser integration evidence proves a customer-style PHP site renders correct local Profile data, direct publisher links, and safe fallback states. After one successful synchronization, making News Scraper unavailable does not make ordinary visitor rendering perform a live API request or blank valid LKG content.

### Next baseline

Green Phase 6 `/closeout` transitions only `package.json` to `1.7.0`.

**Closeout:** completed successfully; conversational `/closeout` transitioned only top-level `package.json` from the accepted `1.6.4` candidate to `1.7.0`, which is the Phase 7 baseline.

## Phase 7 — Managed integration and 2.0 release qualification

**Baseline:** `1.7.0`  
**Prompt versions:** `1.7.x`  
**Goal:** integrate, harden only release-blocking defects, and produce the real managed evidence required to call the product `2.0.0`.

### Required scope

Use a real managed News Scraper instance and an externally hosted customer-style PHP site to observe the full chain:

```text
real approved Sources
→ collection / normalization / persistence
→ canonical eligibility
→ Profile selection
→ machine authentication
→ v1 API pagination
→ complete PHP synchronization
→ validated atomic LKG activation
→ customer server-rendered output
→ direct stored publisher destinations
```

Release qualification must additionally exercise at minimum:

- upstream/API unavailability;
- synchronization failure;
- malformed or incomplete candidate snapshot;
- snapshot revision change during traversal;
- stale valid cache behavior;
- configured stale cutoff where applicable;
- authoritative Profile disable suppressing cached public rendering;
- later successful synchronization restoring re-enabled output;
- credential revocation/invalid authentication;
- rate-limit/`Retry-After` behavior;
- no visitor-path live News Scraper call;
- preserved existing `/` and `/api/feed` behavior;
- production-safe forward migration/data preservation for all 2.0 schema additions;
- existing backup/restore/rollback procedure compatibility;
- operational telemetry sufficient to diagnose the distribution path without visitor/click tracking or secret leakage.

### Release-hardening rule

Phase 7 is not a general refactor or feature bucket. Fix only defects or bounded maintainability/security problems that block the contracted 2.0 release path. Material new product capability requires explicit replanning rather than being hidden in release qualification.

### Exit gate

A durable Phase 7 validation artifact identifies the exact final `1.7.x` candidate SHA and records the applicable automated, real-PostgreSQL, security, browser/server, approved-live-Source, managed-deployment, failure-injection, migration, and recovery evidence.

The gate is green only when the managed external integration is genuinely usable and every required LKG/security/snapshot/disable/compatibility invariant has been observed at the appropriate evidence level.

### Terminal release transition

After the final Phase 7 closeout prompt is reviewed and the Phase 7 validation artifact is green, terminal `/closeout` performs exactly one release transition:

```text
final validated 1.7.x candidate
→ package.json version only
→ 2.0.0
```

No `1.8.0` baseline is created. No `2.0.x` development candidate is created. The transition does not change source, schema, tests, configuration, dependencies, or runtime behavior.

## Explicitly post-2.0

The following do not block `2.0.0` and require later owner-approved roadmap work before implementation:

- Linux VPS/Docker Compose self-host packaging/installable deployment route;
- production-grade autonomous self-hosting;
- native/default self-host administrator authentication;
- reverse-proxy/SSO replacement auth contract and multi-admin identity;
- WordPress plugin;
- RSS/Atom distribution;
- browser-side widgets;
- click/referral/visitor/backlink-performance analytics;
- advanced SEO tooling;
- Kubernetes/multi-node deployment;
- delta synchronization;
- additional adapter families;
- unrelated standalone-reference-frontend SEO/archive/pagination enhancements;
- unrelated collection-filter redesigns unless separately promoted because they become a concrete 2.0 blocker.

Self-hostability remains a locked architectural direction under Law 12 and the managed/self-hostable ADR; only its packaging/productization is deferred beyond the managed 2.0 release.

## Preserved compatibility and non-goals

Throughout all seven phases:

- one Publication/topic per deployed installation remains unchanged;
- topic-specific behavior remains configuration;
- every collected Article still originates from an approved Source;
- Worker owns Source collection;
- Web/API does not collect Sources inline;
- Source/endpoint/run/Article/observation provenance remains intact;
- Source-scoped identity/idempotency remains intact;
- duplicate grouping retains every Source Article and one Primary outward representation;
- exact stored `original_url` remains the reader destination;
- existing `GET /` and `GET /api/feed` remain supported reference/legacy surfaces with existing `public_status` semantics;
- supported production customer data is never treated as disposable;
- migration-from-zero never substitutes for supported production forward-upgrade proof;
- adapters/serializers never become competing editorial/query authorities;
- no 2.0 work guarantees SEO or backlink performance.

## Historical roadmap context

The retired frontend-centric post-1.0 plan remains historical only. Its unexecuted Phase 0 P2/`1.0.2` closeout is permanently retired. Earlier ideas such as crawlable standalone pagination, standalone-site SEO, public summaries, historical archive discovery, thumbnails, and general scale work may be reconsidered later but have no implied position in this active roadmap.

Use `docs/roadmap/mvp-roadmap.md` for completed pre-1.0 Phase 0–21 history and its historical validation links.
