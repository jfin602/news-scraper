# Post-1.0 / 2.0 Roadmap

**Status:** COMPLETE — terminal release transition reached `2.0.0` on 2026-08-27.  
**Final package release:** `2.0.0`.  
**Historical implementation phases:** Phase 1 through Phase 7.  
**Historical task family:** `p1-<phase>` / `1.<phase>.<prompt>`.  
**Successor roadmap:** `docs/roadmap/3.0-roadmap.md` — owner-approved / pre-activation at package `2.0.0`.  
**Primary result:** the managed headless distribution product now has Distribution Profiles, the authenticated v1 API, generic PHP synchronization/LKG/local-read behavior, and a real customer-site integration baseline.

> This file is now historical roadmap authority for the path that produced `2.0.0`. Current post-2.0 phase/version routing belongs to `BOOT.md` and `docs/roadmap/3.0-roadmap.md`. Historical phase wording below is retained so implementation/validation evidence can be interpreted against the roadmap that governed it.

## Roadmap activation

The accepted `1.0.0` customer launch established the first supported production schema/data baseline. Former post-1.0 Phase 0 P1 then shipped the server-rendered bundled/reference root at `1.0.1`.

Before the former Phase 0 P2 closeout executed, the owner approved the headless aggregation/distribution product pivot. That unexecuted P2 was retired and never reserved `1.0.2`. The subsequent 2.0 architecture/planning gate completed and the resulting contracts remain authoritative for the implemented 2.0 baseline unless explicitly amended later.

On 2026-08-20 the owner approved this replacement seven-phase roadmap and explicitly removed Docker Compose/self-host packaging from the `2.0.0` completion gate. The product goal for 2.0 was to prove the managed integration model quickly and rigorously; self-host packaging remained a later product direction rather than release-blocking work.

Roadmap activation authorized the version-only baseline transition from `1.0.1` to `1.1.0`. No retired Phase 0 version was reused.

The historical roadmap workflow was:

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

All 2.0 development remained in the `1.x.x` series. The final release transition alone produced `2.0.0`.

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
Phase 7 prompt/qualification space 1.7.x
terminal /closeout        2.0.0
```

Historical post-1.0 runner grammar remains preserved for old task stacks:

- Phase N folder: `docs/tasks/p1-N/`;
- exact task header: `TASK: Phase N / P<number> — <title>`;
- P<number> target version: `1.N.<number>`;
- exactly one final closeout prompt per phase;
- prompt numbers are contiguous from P1.

The terminal Phase 7 `/closeout` was a deliberate release exception to the ordinary non-terminal handoff. The owner ultimately accepted an explicit Phase 7 release-evidence exception recorded in the durable validation artifact, then terminal `/closeout` changed only top-level `package.json` from `1.7.0` to `2.0.0`. No `1.8.0` baseline or `2.0.x` development candidate was created.

That historical acceptance does not retroactively claim that unexecuted Phase 7 prompts/tests ran. The durable Phase 7 artifact remains the truthful record of the owner-authorized release exception.

## Required product path

The roadmap was designed to deliver and prove this end-to-end authority chain:

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

Every phase preserved topic independence, singleton Publication architecture, approved-Source trust, idempotency/provenance, duplicate suppression, stored `original_url`, and the existing supported `/` plus `/api/feed` reference behavior. The later 2026-08-27 Publication amendment changes only the historical one-Publication/one-topic interpretation: current singleton Publications may contain multiple subject verticals while remaining non-tenant singleton editorial properties.

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

Phase 1 did **not** build the permanent distribution API, machine bearer credentials, PHP client/cache, WordPress, RSS/Atom, or self-host packaging.

Source configuration/collection remained singular and was never duplicated into a Profile. Profile filtering was post-eligibility distribution configuration and never became Article identity, Relevance, moderation, duplicate, or collection logic.

### Exit gate

An authorized administrator can safely create a draft Profile, configure its Source associations and bounded filters, activate it only when valid, disable it, and reload the exact persisted state. Database constraints/transactions preserve immutable keys and relationship integrity. Migration-from-zero and supported production-forward migration preserve previously governed production data.

The complete persisted/application Profile boundary required by later phases was proven through the phase's accepted evidence.

### Next baseline

Green Phase 1 `/closeout` transitioned only `package.json` to `1.2.0`.

**Closeout:** completed; baseline advanced to `1.2.0`.

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

Phase 2 did not expose `/api/v1/distribution/...`, authenticate machines, or implement PHP.

The implementation avoided maintaining a competing eligibility implementation and left one governed canonical eligibility authority plus separate reference-public and Profile-selection consumers.

### Exit gate

Focused plus real-PostgreSQL evidence proved canonical eligibility, Profile filtering, ordering, Category semantics, bounded result behavior, pagination positions, revision behavior, and `public_status` independence. Existing `/` and `/api/feed` regressions remained green for the accepted tree.

The producer handoff exposed the distribution query capabilities later HTTP work required; the API did not invent Article SQL, Profile interpretation, ordering, or revision semantics.

### Next baseline

Green Phase 2 `/closeout` transitioned only `package.json` to `1.3.0`.

**Closeout:** completed successfully; baseline advanced to `1.3.0`.

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

Initial 2.0 credentials were instance-scoped, not Profile-scoped. The phase did not create a credential↔Profile authorization matrix or Profile-specific authenticated-but-forbidden `403` model.

This phase did not build the distribution HTTP route itself.

### Exit gate

Credential generation, verifier storage, authentication, expiry, rotation overlap, revocation, rate/abuse boundaries, and strict machine/admin separation were proven with focused security/integration/database evidence. Phase 4 consumed the tested authentication interface rather than inventing security logic in a route.

### Next baseline

Green Phase 3 `/closeout` transitioned only `package.json` to `1.4.0`.

**Closeout:** completed successfully; baseline advanced to `1.4.0`.

## Phase 4 — Versioned v1 distribution API

**Baseline:** `1.4.0`  
**Prompt versions:** `1.4.x`  
**Goal:** expose the permanent authenticated machine interface by composing the Phase 2 read model and Phase 3 authentication boundary.

### Required scope

Implemented:

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

The HTTP serializer/controller remains thin. It does not reimplement Profile filters, canonical eligibility, Category semantics, duplicate suppression, cursor positions, revision generation, or Article query composition.

`GET /` and `GET /api/feed` remain supported legacy/reference surfaces and were not expanded into the Profile API.

### Exit gate

The documented v1 contract passed focused HTTP/component/security tests plus applicable real-PostgreSQL query/revision evidence for its accepted source tree. Multi-page traversal cannot mix revisions. Invalid/disabled/missing/rate-limited/dependency states are bounded.

A custom server-side consumer can use the v1 API without PHP-specific behavior.

### Next baseline

Green Phase 4 `/closeout` transitioned only `package.json` to `1.5.0`.

**Closeout:** completed successfully; baseline advanced to `1.5.0`.

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

Phase 5 owns synchronization/cache correctness, not customer HTML presentation. Rendering was not required to prove the synchronization engine.

The PHP client remains thin and cannot implement Source trust, Profile selectors, Relevance, Category, moderation, duplicate, ordering, or destination rules.

### Exit gate

Deterministic PHP integration tests proved complete traversal, validation, locking, retry behavior, mixed/partial candidate rejection, atomic activation, LKG preservation, stale policy, never-synced behavior, authoritative disable, and re-enable for the accepted tree. Upstream/network/API failure cannot corrupt or replace active valid snapshot state.

### Next baseline

Green Phase 5 `/closeout` transitioned only `package.json` to `1.6.0`.

**Closeout:** completed successfully; baseline advanced to `1.6.0`.

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
- lightweight customer-style/example integration harness suitable for later deployment proof;
- visible local sync/cache health where useful to integrators/operators.

### Boundaries

Customer presentation may replace the fallback renderer but cannot reinterpret upstream eligibility, filtering, deduplication, ordering, or destinations.

The phase did not build WordPress, RSS/Atom, click analytics, browser widgets, or advanced SEO tooling.

### Exit gate

Server/browser integration evidence proved a customer-style PHP site can render correct local Profile data, direct publisher links, and safe fallback states. After one successful synchronization, making News Scraper unavailable does not make ordinary visitor rendering perform a live API request or blank valid LKG content.

### Next baseline

Green Phase 6 `/closeout` transitioned only `package.json` to `1.7.0`.

**Closeout:** completed successfully; baseline advanced to `1.7.0`.

## Phase 7 — Managed integration and 2.0 release qualification

**Baseline:** `1.7.0`  
**Prompt versions:** planned `1.7.x`  
**Goal:** integrate, harden only release-blocking defects, and produce the real managed evidence required to call the product `2.0.0`.

### Planned required scope

The intended real managed qualification chain was:

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

The planned release qualification also covered upstream/API unavailability, synchronization failure, invalid/mixed snapshots, stale behavior, Profile disable/re-enable, credential/rate behavior, no visitor-path live call, legacy/reference regressions, production migration/data preservation, backup/restore/rollback compatibility, and secret-safe telemetry.

### Actual terminal acceptance

The full planned P1–P4 Phase 7 prompt/evidence sequence was not executed before release. The repository owner explicitly accepted the live customer integration as sufficient operator evidence to waive that formal sequence and proceed to the terminal release. The durable artifact `docs/validation/phase-7-managed-integration-and-2.0-release-qualification.md` records that exception and must remain the source of truth for what was and was not verified.

This roadmap therefore records Phase 7 as **owner-accepted by explicit release exception**, not as a claim that every originally planned test/failure-injection item was observed.

### Terminal release transition

After owner acceptance, terminal `/closeout` performed exactly one release transition:

```text
1.7.0 accepted baseline
→ package.json version only
→ 2.0.0
```

Commit `58a5387fba23a3ae3e14cccfd92c062817351ca0` changed only the top-level `package.json` version from `1.7.0` to `2.0.0`. No `1.8.0` baseline or `2.0.x` development candidate was created by this roadmap.

## Explicitly post-2.0 at roadmap completion

At 2.0 completion, the following had not been required and remained future work unless later promoted:

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
- unrelated collection-filter redesigns.

A later owner-approved roadmap may promote any of these; their presence in this historical list does not put them into current scope automatically.

Self-hostability remains a locked architectural direction under Law 12 and the managed/self-hostable ADR; only its packaging/productization was deferred beyond the managed 2.0 release.

## Preserved compatibility and non-goals

Throughout the seven-phase design and completed baseline:

- one singleton Publication per deployed installation remained unchanged;
- topic-specific behavior remained configuration;
- every collected Article still originated from an approved Source;
- Worker owned Source collection;
- Web/API did not collect Sources inline;
- Source/endpoint/run/Article/observation provenance remained intact;
- Source-scoped identity/idempotency remained intact;
- duplicate grouping retained every Source Article and one Primary outward representation;
- exact stored `original_url` remained the reader destination;
- existing `GET /` and `GET /api/feed` remained supported reference/legacy surfaces with existing `public_status` semantics;
- supported production customer data was not treated as disposable;
- migration-from-zero did not substitute for supported production forward-upgrade proof;
- adapters/serializers did not become competing editorial/query authorities;
- no 2.0 work guaranteed SEO or backlink performance.

The later 2026-08-27 Law 11 amendment retains every item above while clarifying that the one singleton Publication is a customer/editorial property that may contain multiple subject verticals through Profiles.

## Historical roadmap context

The retired frontend-centric post-1.0 plan remains historical only. Its unexecuted Phase 0 P2/`1.0.2` closeout is permanently retired. Earlier ideas such as crawlable standalone pagination, standalone-site SEO, public summaries, historical archive discovery, thumbnails, and general scale work may be reconsidered later but have no implied position in the successor roadmap.

Use `docs/roadmap/mvp-roadmap.md` for completed pre-1.0 Phase 0–21 history and its historical validation links.

## Successor roadmap

The owner-approved post-2.0 direction is `docs/roadmap/3.0-roadmap.md`.

That roadmap is intentionally **pre-activation** at package `2.0.0` until the phase runner is extended, through a separate unchanged-`2.0.0` correction, to safely support the intended `2.<phase>.<prompt>` development family. Historical `p1-*` grammar in this document must remain unchanged while that correction is designed and tested.
