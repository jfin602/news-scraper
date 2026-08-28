# AGENTS.md

## Project and authority

News Scraper is a reusable, topic-independent **headless news aggregation and distribution Platform**. Each installation hosts exactly one singleton Publication representing one customer/editorial property and governed content universe; that Publication may contain multiple related subject verticals or feed sections exposed through Distribution Profiles. Publication is singleton editorial/configuration state, not a relational tenant key. The administrator surface is the control plane. Current implemented outward consumers are authenticated `GET /api/v1/distribution/{profile_key}`, `GET /api/feed`, and the bundled/reference `GET /` frontend; neither reference consumer requires a reader-selectable Publication.

Read `BOOT.md` first and route through `docs/README.md` to the narrowest authority. `docs/contracts/project-contract.md` owns locked laws and top-level invariants; `docs/contracts/product-scope-and-users.md` owns current product scope; `docs/contracts/distribution-and-integration-contract.md` owns Distribution Profile/PHP behavior; `docs/contracts/distribution-api-contract.md` owns the permanent machine interface; `docs/contracts/ai-assistance-contract.md` owns active Phase 1 Gemini digest behavior and later AI boundaries; Accepted ADRs own architecture; the testing contract owns proof; the current roadmap owns phase/version sequencing. The completed `docs/roadmap/phase-1-gemini-summary-worksheet.md` is the owner-approved planning record whose locked decisions have been promoted into those governing contracts/roadmap.

If work conflicts with a locked law, report the conflict. Do not silently treat code, a summary, historical evidence, or the worksheet as higher authority than the contracts after promotion.

## Documentation workflow

Follow `BOOT.md`.

- `/docs-review` is read-only. Documentation changes require approved findings plus `/docs-apply`, or `/docs-prompt [<model configuration>]` to generate a docs-only Codex prompt. `/docs-prompt` normally reuses the approved review context from the current conversation; use `npm run docs:snapshot` plus a supplied snapshot only as fallback when that context is unavailable or insufficient, or when explicitly requested. A valid optional model configuration is an owner-selected target and the prompt is optimized for it; when omitted, use `docs/codex-model-selection.md` to recommend the minimum-cost adequate supported configuration and optimize the prompt for that recommendation. Explicit model arguments are case-insensitive, normalize to canonical executable labels, take precedence over automatic recommendation, and fail closed if unsupported. Every successful `/docs-prompt` writes/replaces and commits the tracked `.codex/docs-prompt.txt` handoff on `main`; the generated prompt must fetch/check `origin/main` and stop before editing if its checkout is stale or lacks the current prompt commit. Chat reports the path/configuration/commit and tells the owner to pull/update `main` rather than using a copy/pasted full prompt.
- `/docs-apply` changes only approved documentation scope. Preserve unrelated wording.
- The current roadmap may have a brief companion changelog, presently `docs/roadmap/3.0-changelog.md`. `/docs-review` identifies whether accepted work or a material accepted roadmap/contract decision warrants an entry; `/docs-apply` adds only approved entries. The changelog is a non-authoritative summary and never substitutes for contracts, roadmap sequencing, or validation evidence.
- Normal non-terminal handoff is `/closeout` → `/docs-review` → `/docs-apply` → `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.
- Roadmap `/closeout` and a correction stack's final manual closeout are different. A correction closeout clears only that correction and preserves roadmap phase/package version.
- Terminal MVP Phase 21 `/closeout` transitioned the final validated `0.21.x` tree to `1.0.0`.
- Former post-1.0 Phase 0 P1 shipped the server-rendered root at `1.0.1`; its unexecuted P2/`1.0.2` closeout is permanently retired.
- The seven-phase 2.0 roadmap is complete. Terminal `/closeout` changed only top-level `package.json` to `2.0.0`; the Phase 7 owner-approved evidence exception remains recorded in the durable validation artifact and is not rewritten as unobserved test evidence.
- The owner-approved 3.0 roadmap is **active in Phase 1** at package `2.1.0`. The post-2.0 runner compatibility correction and N6WD Article-summary correction are GREEN/owner-accepted prerequisites.
- The completed Phase 1 Gemini worksheet is consumed planning input; prompt planning must use the promoted contract/roadmap semantics rather than reopen or reinterpret its 12 owner-approved decisions.
- Use `docs/codex-model-selection.md` for detailed minimum-cost-adequate model/reasoning/usage policy.

## Versioning and task-stack grammar

`package.json` is the sole current-version authority and is currently `2.1.0`. Documentation, correction, and UI work is non-versioned unless an explicit owner-authorized roadmap activation/release transition says otherwise.

### Current executable roadmap grammar

The machine parser `scripts/codex-phase-core.mjs` supports:

- historical pre-1.0 phase folders `p<number>` with target versions `0.<phase>.<prompt>`;
- historical post-1.0/2.0 phase folders `p1-<phase>` with target versions `1.<phase>.<prompt>`; and
- active post-2.0/3.0 phase folders `p2-<phase>` with target versions `2.<phase>.<prompt>`.

Those historical semantics remain supported. The 2.0 roadmap's `p1-*` task stacks are completed history; they must not be reinterpreted as 3.0 task stacks. Historical `p2` remains historical Phase 2; only `p2-<phase>` selects the post-2.0 family.

### Active 3.0 grammar

The owner-approved `docs/roadmap/3.0-roadmap.md` uses:

- Phase N folder: `p2-N`;
- prompt target: `2.N.<prompt number>`;
- current Phase 1 folder: `p2-1`;
- current Phase 1 prompt space: `2.1.x`, beginning at `2.1.1`.

The runner correction remains historical non-versioned correction work completed at `2.0.0`; the separately authorized roadmap activation changed only top-level `package.json` from `2.0.0` to `2.1.0`.

The machine parser is `scripts/codex-phase-core.mjs`; parser changes must update BOOT and focused parser tests. Before reporting `/prompt-write` complete, run `npm run codex:phase:validate -- <task-folder>` when local execution is available. `npm run codex:phase -- <task-folder>` executes implementation prompts and stops before the parsed final closeout prompt by default. `npm run codex:phase -- <task-folder> --closeout` may invoke that final prompt after the Git-proven implementation prefix completes, but its result remains HUMAN REVIEW REQUIRED and is never automatically accepted.

Common grammar preserved across supported phase families:

- filenames are `P<number>-<lower-kebab-slug>.txt`, one-based, unique, contiguous from P1;
- every prompt has exactly one `- Recommended configuration:` line containing one supported backtick-delimited `MODEL_CONFIGS` label and a final period;
- exactly one final prompt is the closeout; both filename slug and parsed `TASK:` title contain `closeout`;
- phase task header is `TASK: Phase <phase> / P<number> — <title>`;
- each roadmap prompt contains exactly one `assigned project version is` phrase with the version required by its supported roadmap family;
- roadmap prompts do not contain correction unchanged-version metadata.

Correction stacks remain non-versioned:

- folder `c<roadmap-phase>-<lower-kebab-slug>`;
- exact header `TASK: Correction <phase> / P<number> — <title>`;
- exactly one `- Required unchanged project version: `<version>`.` line in every prompt;
- no assigned-version metadata;
- correction closeout does not invoke/substitute for roadmap `/closeout` or advance package version.

Targeted UI prompts under `docs/design/tasks/` are not a `codex:phase` grammar. They follow `docs/design/ui-workflow.md`, execute on `ui-polish`, preserve package version/roadmap state, and never imply automatic integration.

## Roadmap state

### Completed 2.0 roadmap

`docs/roadmap/post-1.0-roadmap.md` is COMPLETE. It produced the `2.0.0` baseline through Distribution Profile persistence, canonical Profile/read-model authority, machine credentials/security, permanent v1 API, generic PHP synchronization/LKG, normalized local-read/customer SSR integration, and the owner-accepted real customer integration release transition.

Historical Phase 7 planned qualification items are not automatically current requirements or evidence. Use the durable Phase 7 artifact to distinguish observed/operator-accepted evidence from the unexecuted formal prompt sequence.

### Owner-approved 3.0 roadmap — active Phase 1

**Current package:** `2.1.0`  
**Roadmap:** `docs/roadmap/3.0-roadmap.md`  
**Status:** owner-approved / ACTIVE — PHASE 1  
**Current phase:** Gemini Profile digest foundation  
**Current task family:** `p2-1`  
**First prompt version:** `2.1.1`  
**Planned terminal target:** `3.0.0`, with final exit gate intentionally owner-controlled/TBD

Current/planned sequence:

1. `2.1.x` — Gemini Profile digest foundation;
2. `2.2.x` — PHP integration correction + Gemini-capable customer package refresh/deployment;
3. `2.3.x` — Profile-grounded "Ask this feed" chatbot;
4. `2.4.x` — real multi-feed customer integration proof for publishing news, opportunities, and indie filmmaking from one singleton Publication/editorial property;
5. `2.5.x+` — remaining admin and PHP integration tightening based on observed real deployment friction;
6. terminal `3.0.0` only after the owner explicitly locks and satisfies the final gate.

The accepted `c1-n6wd` correction already implements the governed 4,000-code-point normalized/persisted Article summary bound and production-forward migration. Phase 1 consumes that producer boundary and must not duplicate it.

The completed Phase 1 worksheet locks the implementation planning assumptions: two scheduled evaluations/day, default 7-day lookback, configurable/hard-ceiling 1–20 Article input with default 20, canonical Profile order, governed URL Context, structured overview/highlights/support references, internal `digestInputIdentity`, immutable successful digest records plus separate active pointer/attempt state, `current | older | null` lifecycle, additive v1 digest snapshot state, PHP optional-AI fail-open normalization, Profile AI admin controls, and customer-owned final presentation.

The 3.0 roadmap does not automatically promote previously post-2.0 ideas such as self-host packaging, WordPress, RSS/Atom output, analytics, advanced SEO tooling, delta sync, or additional adapters.

Self-hostability remains a locked architectural direction under Law 12; only packaging/productization is deferred.

## High-risk implementation guardrails

Always preserve these boundaries and read the routed contract for detail:

- Shared aggregation/distribution/AI orchestration remains topic independent. Do not introduce Publication IDs/slugs/FKs/joins/uniqueness scopes/repository parameters/authorization scopes merely for vertical separation or hypothetical concurrent hosting.
- One singleton Publication per deployment remains the supported data model. The Publication is one customer/editorial property and may contain multiple related subject verticals/feeds; Distribution Profiles are the supported outward feed/section boundary.
- Multiple Profiles do not create Publications, tenants, Article ownership scopes, or competing collection/editorial authorities.
- The administrator UI/API is the control plane. The bundled `/` frontend is a supported reference/standalone consumer; `GET /api/feed` is a current legacy/reference JSON surface.
- Collection trust and distribution selection are distinct. Source approval authorizes governed collection; Profile membership determines which already-eligible Source Articles can enter one distribution output.
- The transport-independent canonical distribution Article eligibility/Profile read-model producer owns effective outward Categories, bounded results/history, keyset continuation positions, and deterministic snapshot revisions. Later API/AI/adapters must reuse it.
- The governed v1 machine HTTP interface composes the canonical read model and machine credential/authentication/request-guard foundations. Generic PHP synchronization/LKG consumes that stable API.
- Phase 1 digest input must be a deterministic bounded narrowing of canonical Profile output, preserving canonical order; AI cannot introduce another selector/ranker.
- Phase 1 active digest state is part of the same outward Profile snapshot/revision and PHP LKG/local-read path. Do not invent a second digest endpoint, digest ETag, customer digest cron, or visitor-time upstream read.
- `digestInputIdentity` is internal generation provenance/idempotency state and must not be conflated with outward `snapshotRevision`.
- Persisted digest lifecycle must keep immutable successful generations, a separate active reference, and separate bounded attempt state; consumers never observe partial digest state.
- Downstream digest freshness is exactly `current | older` when a digest exists, otherwise `null`; age alone does not define staleness and canonical invalidation overrides old-digest retention.
- Optional invalid digest state fails open relative to valid Article API/PHP snapshot state.
- Normalized local Profile/Article/digest access uses the customer-facing `LocalProfileReader` / `LocalReadResult` boundary; new work must not bypass it by parsing cache files or making ordinary visitor-path upstream calls.
- Customer final Article/digest HTML/CSS/layout is customer-owned. Phase 1 must not expand the current fallback renderer into an authoritative digest presentation layer; Phase 2 owns renderer-boundary cleanup/package refresh.
- Source is the approved publisher/trust boundary; endpoint is its concrete feed/API/HTML location. Approval, lifecycle, operational state, and derived health are distinct.
- Only approved, active, enabled Sources/endpoints are collectable while singleton Publication collection is active. Bootstrap never auto-approves or silently widens trust.
- Every request and redirect hop passes approval plus DNS/address/port/SSRF checks before contact. Article links pass their separate post-normalization Source/domain policy gate.
- Parsers produce Raw items and never persist Articles. The Source RSS/Atom admission filter remains distinct from Relevance and from Distribution Profile filtering.
- Normalization precedes Article-link policy, Relevance/Categories, identity, duplicates, outward use, and AI grounding.
- Article identity is Source-scoped and transactionally idempotent. True-duplicate grouping relates separately stored Articles and never destroys provenance.
- Article visibility and duplicate role are independent.
- Preserve Source/endpoint/run/Article/observation relationships and provenance. Source failures remain isolated; Web/API never collects Sources inline.
- Reader/headline destinations use stored `original_url`; `canonical_identity_url` remains identity data.
- Canonical distribution eligibility is independent of reference `public_status`; `/` and `/api/feed` retain their existing `public_status` behavior.
- Machine credentials are separate from human admin access and never imply administrator authority.
- The current managed/reference admin uses Cloudflare Access with direct-origin protection, request integrity, and real relationship validation.
- AI assistance is downstream of one Profile's canonical governed Articles. It cannot approve Sources, change Relevance/Categories, moderate, deduplicate, rerank canonical output, manufacture destinations, or become an ordinary feed-delivery dependency.
- Gemini keys remain server-side. Source text, user chat input, retrieved publisher-page text, and model output are untrusted. Model-proposed citations/support references must be validated and visible Article links resolved from stored `originalUrl`.
- Existing `distribution:read` authority must not silently become unlimited billable interactive AI authority; roadmap Phase 3 owns the separately governed AI capability/rate/cost boundary.

The thirteen locked laws remain authoritative in `docs/contracts/project-contract.md`; this guardrail list does not replace them.

## Production compatibility

The accepted Phase 20 launch artifact defines the first supported production source/version/schema baseline. Customer data and governed relationships are durable supported state. Clean migration from zero remains required for new/disposable installations but never substitutes for supported baseline upgrade/data-preservation proof.

Do not apply the earlier pre-production destructive-reset rule to customer state or rewrite supported migration history merely to simplify the final schema. For persistence changes, trace baseline → forward migration → data/relationship preservation → backup/rollback/restore → consumers/tests under `docs/decisions/production-data-and-schema-compatibility.md`.

Distribution Profile persistence already established the requirement for both migration-from-zero and supported production-forward migration evidence. Any 3.0 persisted AI/auth/integration changes inherit the same production compatibility law.

## Validation honesty

- Every implementation change needs focused automated coverage plus relevant broader regression coverage for its blast radius.
- Validation planning MUST resolve the testing contract's Test Necessity Matrix and Test Environment Matrix before prompt writing; crossing multiple surfaces takes the union and shared helpers inherit important-consumer obligations.
- Every implementation/closeout prompt carries a `RUN` / `DEFER` / `N/A` validation manifest. `DEFER` means required later in the assigned environment, not skipped, passed, waived, or optional.
- Use narrow focused suites during iteration and the smallest non-overlapping `RUN` command set covering all required evidence; do not knowingly invoke VPS-required/live evidence from a normal Windows prompt merely to trigger a prerequisite failure.
- Explicitly invoked specialized suites remain fail-closed when prerequisites are unexpectedly unavailable. Deterministic prerequisite/environment failures are not automatically retried.
- Cross-environment exact-tree matching applies when multiple environments are combined for the same acceptance/qualification claim. Ordinary implementation and ordinary phase/correction closeout gates may finish GREEN with correctly deferred VPS/live/reference evidence when those items belong to the later full-system/project release qualification gate.
- Producer prompts with downstream consumers must map every required capability to the owning implementation/export and focused proof; consumers must not invent producer-owned SQL, cursor, state, transaction, validation, or topology semantics.
- Evidence applies only to the exact final tree tested. Source inspection is not runtime proof; mocks do not prove PostgreSQL guarantees; HTTP integration is not browser proof; fixtures are not live-Source or live-Gemini proof.
- Explicitly required suites fail when prerequisites are absent, skipped, flaky, or select zero tests.
- Persistence/concurrency/migration claims require real disposable PostgreSQL where applicable.
- Post-launch schema changes require migration-from-zero plus supported Phase 20-baseline upgrade/data preservation.
- Gemini/provider behavior is not reported as live-verified unless an actual provider request was executed against the exact relevant tree/environment. Local mocks prove only orchestration.

Historical validation qualifications remain historical and must not be rewritten.

## UI workstream

UI work is governed by `docs/design/ui-workflow.md` on permanent branch `ui-polish`. Keep it in a separate worktree from active roadmap/correction runner work. It is non-versioned and does not advance roadmap/correction state.

The bundled/reference frontend remains a separate presentation consumer. Integration presentation belongs to Law 13 and the distribution contract.

Normal path: `/ui-plan` → `/ui-write`. If durable design guidance is missing, contradictory, materially ambiguous, or must change: `/ui-review` → explicit approval → `/ui-apply` → rerun `/ui-plan` → `/ui-write`.

## Working preferences

- Inspect current source/docs and shared producers/consumers before planning or editing.
- Prefer the smallest file-scoped, regression-safe change; state non-goals and preserved behavior.
- Split complex transactional/state-machine work from separately consumed read/API work when consumers, tests, or failure risks differ materially.
- For collection changes, trace endpoint type/profile → approval/state → lock/network safety → fetch/redirect → parser/admission → normalization/link policy/Relevance/identity/persistence/duplicates → run/health/admin consumers.
- For outward/distribution/AI work, trace canonical Article selection → Profile → digest input identity/state machine → provider → v1 snapshot → PHP/LKG/local-read → customer presentation → security/cache/link implications → tests.
- For existing reference-frontend work, trace singleton settings → canonical read model → `/api/feed` → `/` → unavailable/errors/external links → browser coverage.
- Search all references before renames. Never invent repository state, test results, Source behavior, provider behavior, or history.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
