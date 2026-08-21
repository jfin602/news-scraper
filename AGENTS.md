# AGENTS.md

## Project and authority

News Scraper is a reusable, topic-independent **headless news aggregation and distribution Platform**. Each installation hosts exactly one Publication/topic; another topic uses another configured deployment of the shared codebase. Publication is singleton editorial/configuration state, not a relational tenant key. The administrator surface is the control plane. Current implemented outward consumers are `GET /api/feed` plus the bundled/reference `GET /` frontend; neither requires a reader-selectable Publication.

Read `BOOT.md` first and route through `docs/README.md` to the narrowest authority. `docs/contracts/project-contract.md` owns locked laws and top-level invariants; `docs/contracts/product-scope-and-users.md` owns current product scope; `docs/contracts/distribution-and-integration-contract.md` owns Distribution Profile/PHP behavior; `docs/contracts/distribution-api-contract.md` owns the permanent machine interface; Accepted ADRs own architecture; the testing contract owns proof; the roadmap owns phase/version sequencing.

If work conflicts with a locked law, report the conflict. Do not silently treat code, a summary, or historical evidence as higher authority.

## Documentation workflow

Follow `BOOT.md`.

- `/docs-review` is read-only. Documentation changes require approved findings plus `/docs-apply`, or `/docs-prompt [<model configuration>]` to generate a docs-only Codex prompt. `/docs-prompt` normally reuses the approved review context from the current conversation; use `npm run docs:snapshot` plus a supplied snapshot only as fallback when that context is unavailable or insufficient, or when explicitly requested. A valid optional model configuration is an owner-selected target and the prompt is optimized for it; when omitted, use `docs/codex-model-selection.md` to recommend the minimum-cost adequate supported configuration and optimize the prompt for that recommendation. Explicit model arguments are case-insensitive, normalize to canonical executable labels, take precedence over automatic recommendation, and fail closed if unsupported. Every successful `/docs-prompt` writes/replaces and commits the tracked `.codex/docs-prompt.txt` handoff on `main`; the generated prompt must fetch/check `origin/main` and stop before editing if its checkout is stale or lacks the current prompt commit. Chat reports the path/configuration/commit and tells the owner to pull/update `main` rather than using a copy/pasted full prompt.
- `/docs-apply` changes only approved documentation scope. Preserve unrelated wording.
- Normal non-terminal handoff is `/closeout` → `/docs-review` → `/docs-apply` → `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.
- Roadmap `/closeout` and a correction stack's final manual closeout are different. A correction closeout clears only that correction and preserves roadmap phase/package version.
- Terminal MVP Phase 21 `/closeout` already transitioned the final validated `0.21.x` tree to `1.0.0`.
- Former post-1.0 Phase 0 P1 shipped the server-rendered root at `1.0.1`; its unexecuted P2/`1.0.2` closeout is permanently retired.
- The owner-approved replacement 2.0 roadmap is active. Phase 2 closed to the Phase 3 `1.3.0` baseline; normal roadmap prompt planning may resume.
- Use `docs/codex-model-selection.md` for detailed minimum-cost-adequate model/reasoning/usage policy.

## Versioning and task-stack grammar

`package.json` is the sole current-version authority and is currently `1.3.0`. Documentation, correction, and UI work is non-versioned unless an explicit owner-authorized roadmap activation/release transition says otherwise.

The active seven-phase roadmap uses the existing post-1.0 runner grammar:

- Phase N folder: `p1-N`;
- prompt target: `1.N.<prompt number>`;
- current Phase 3 folder: `p1-3`;
- current next prompt version: `1.3.1`;
- non-terminal green `/closeout` moves only to the documented next `1.<phase>.0` baseline;
- terminal Phase 7 `/closeout` moves the final validated `1.7.x` candidate directly to `2.0.0`, creates no `1.8.0`, and does not create a `2.0.x` development series.

The machine parser is `scripts/codex-phase-core.mjs`; parser changes must update BOOT and focused parser tests. Before reporting `/prompt-write` complete, run `npm run codex:phase:validate -- <task-folder>` when local execution is available. `npm run codex:phase -- <task-folder>` executes implementation prompts and stops before the parsed final closeout prompt by default. `npm run codex:phase -- <task-folder> --closeout` may invoke that final prompt after the Git-proven implementation prefix completes, but its result remains HUMAN REVIEW REQUIRED and is never automatically accepted.

Common grammar:

- filenames are `P<number>-<lower-kebab-slug>.txt`, one-based, unique, contiguous from P1;
- every prompt has exactly one `- Recommended configuration:` line containing one supported backtick-delimited `MODEL_CONFIGS` label and a final period;
- exactly one final prompt is the closeout; both filename slug and parsed `TASK:` title contain `closeout`;
- post-1.0 phase task header is `TASK: Phase <phase> / P<number> — <title>`;
- each roadmap prompt contains exactly one `assigned project version is` phrase followed by `1.<phase>.<prompt number>`;
- roadmap prompts do not contain correction unchanged-version metadata.

Correction stacks remain non-versioned:

- folder `c<roadmap-phase>-<lower-kebab-slug>`;
- exact header `TASK: Correction <phase> / P<number> — <title>`;
- exactly one `- Required unchanged project version: `<version>`.` line in every prompt;
- no assigned-version metadata;
- correction closeout does not invoke/substitute for roadmap `/closeout` or advance package version.

Targeted UI prompts under `docs/design/tasks/` are not a `codex:phase` grammar. They follow `docs/design/ui-workflow.md`, execute on `ui-polish`, preserve package version/roadmap state, and never imply automatic integration.

## Active 2.0 roadmap

**Current phase:** Phase 3 — Machine credentials and distribution security
**Current baseline:** `1.3.0`
**Current task folder:** `docs/tasks/p1-3/` when written
**Terminal target:** `2.0.0`

The roadmap sequence is:

1. `1.1.x` — Distribution Profile persistence + admin control plane;
2. `1.2.x` — canonical distribution read model;
3. `1.3.x` — machine credentials + distribution security;
4. `1.4.x` — versioned `/api/v1/distribution/{profile_key}`;
5. `1.5.x` — generic PHP synchronization + LKG core;
6. `1.6.x` — PHP local data API + server-rendered customer integration;
7. `1.7.x` — managed integration + 2.0 release qualification;
8. terminal version-only transition to `2.0.0`.

Linux VPS/Docker Compose self-host packaging, autonomous self-host production support, native self-host admin auth, WordPress, RSS/Atom, browser widgets, click/referral analytics, advanced SEO tooling, delta sync, and additional adapter families are post-2.0 unless a later owner-approved contract/roadmap change promotes them.

Self-hostability remains a locked architectural direction under Law 12; only packaging/productization is deferred.

## High-risk implementation guardrails

Always preserve these boundaries and read the routed contract for detail:

- Shared aggregation/distribution logic remains topic independent. Do not introduce Publication IDs/slugs/FKs/joins/uniqueness scopes/repository parameters/authorization scopes merely for hypothetical concurrent hosting.
- One Publication/topic per deployment remains the supported data model.
- The administrator UI/API is the control plane. The bundled `/` frontend is a supported reference/standalone consumer; `GET /api/feed` is a current legacy/reference JSON surface.
- Collection trust and distribution selection are distinct. Source approval authorizes governed collection; Profile membership determines which already-eligible Source Articles can enter one distribution output.
- Phase 2 implemented the transport-independent canonical distribution Article eligibility/Profile read-model producer, including effective outward Categories, bounded results/history, keyset continuation positions, and deterministic snapshot revisions. Later API work must reuse it.
- Phase 3 may implement only machine bearer-credential generation/lifecycle, secure verifier/digest persistence, `distribution:read`, expiry/revocation/rotation, a reusable machine-auth boundary, rate-limit/invalid-auth abuse foundations, protected administrator credential controls, strict machine/admin separation, and production-safe persistence/migrations. It must not build the distribution HTTP route or pull PHP/LKG/post-2.0 capabilities forward.
- Future distribution consumers, including Phase 4, must reuse canonical outward Article-selection semantics rather than recreate Article/Profile query semantics, eligibility, duplicate, moderation, ordering, Category, continuation, snapshot revision, or destination rules.
- Source is the approved publisher/trust boundary; endpoint is its concrete feed/API/HTML location. Approval, lifecycle, operational state, and derived health are distinct.
- Only approved, active, enabled Sources/endpoints are collectable while singleton Publication collection is active. Bootstrap never auto-approves or silently widens trust.
- Every request and redirect hop passes approval plus DNS/address/port/SSRF checks before contact. Article links pass their separate post-normalization Source/domain policy gate.
- Parsers produce Raw items and never persist Articles. The Source RSS/Atom admission filter remains distinct from Relevance and from Distribution Profile filtering.
- Normalization precedes Article-link policy, Relevance/Categories, identity, duplicates, and outward use.
- Article identity is Source-scoped and transactionally idempotent. True-duplicate grouping relates separately stored Articles and never destroys provenance.
- Article visibility and duplicate role are independent.
- Preserve Source/endpoint/run/Article/observation relationships and provenance. Source failures remain isolated; Web/API never collects Sources inline.
- Reader/headline destinations use stored `original_url`; `canonical_identity_url` remains identity data.
- Canonical distribution eligibility is independent of reference `public_status`; `/` and `/api/feed` retain their existing `public_status` behavior.
- Machine credentials are separate from human admin access and never imply administrator authority.
- The current managed/reference admin uses Cloudflare Access with direct-origin protection, request integrity, and real relationship validation.

The thirteen locked laws remain authoritative in `docs/contracts/project-contract.md`; this guardrail list does not replace them.

## Production compatibility

The accepted Phase 20 launch artifact defines the first supported production source/version/schema baseline. Customer data and governed relationships are durable supported state. Clean migration from zero remains required for new/disposable installations but never substitutes for supported baseline upgrade/data-preservation proof.

Do not apply the earlier pre-production destructive-reset rule to customer state or rewrite supported migration history merely to simplify the final schema. For persistence changes, trace baseline → forward migration → data/relationship preservation → backup/rollback/restore → consumers/tests under `docs/decisions/production-data-and-schema-compatibility.md`.

Phase 1 Profile persistence required both migration-from-zero and supported production-forward migration evidence.

## Validation honesty

- Every implementation change needs focused automated coverage plus relevant broader regression coverage for its blast radius.
- Producer prompts with downstream consumers must map every required capability to the owning implementation/export and focused proof; consumers must not invent producer-owned SQL, cursor, state, transaction, validation, or topology semantics.
- Use narrow focused suites during iteration and the smallest non-overlapping final command set covering all required evidence.
- Evidence applies only to the exact final tree tested. Source inspection is not runtime proof; mocks do not prove PostgreSQL guarantees; HTTP integration is not browser proof; fixtures are not live-Source proof.
- Explicitly required suites fail when prerequisites are absent, skipped, flaky, or select zero tests.
- Persistence/concurrency/migration claims require real disposable PostgreSQL where applicable.
- Post-1.0 schema changes require migration-from-zero plus supported Phase 20-baseline upgrade/data preservation.

Historical validation qualifications remain historical and must not be rewritten.

## Roadmap state

The MVP roadmap is complete through terminal Phase 21 and the supported production baseline remains `1.0.0`.

**Current package version:** `1.3.0`
**Current roadmap:** `docs/roadmap/post-1.0-roadmap.md`  
**Current implementation phase:** **Phase 3 — Machine credentials and distribution security**
**Next prompt version:** `1.3.1`
**Terminal release target:** `2.0.0`

The old `p1-0` stack is retired. Use the active roadmap for current phase/version authority.

## UI workstream

UI work is governed by `docs/design/ui-workflow.md` on permanent branch `ui-polish`. Keep it in a separate worktree from active roadmap/correction runner work. It is non-versioned and does not advance roadmap/correction state.

The bundled/reference frontend remains a separate presentation consumer. Integration presentation belongs to Law 13 and the distribution contract.

Normal path: `/ui-plan` → `/ui-write`. If durable design guidance is missing, contradictory, materially ambiguous, or must change: `/ui-review` → explicit approval → `/ui-apply` → rerun `/ui-plan` → `/ui-write`.

## Working preferences

- Inspect current source/docs and shared producers/consumers before planning or editing.
- Prefer the smallest file-scoped, regression-safe change; state non-goals and preserved behavior.
- Split complex transactional/state-machine work from separately consumed read/API work when consumers, tests, or failure risks differ materially.
- For collection changes, trace endpoint type/profile → approval/state → lock/network safety → fetch/redirect → parser/admission → normalization/link policy/Relevance/identity/persistence/duplicates → run/health/admin consumers.
- For outward/distribution work, trace canonical Article selection → Profile → read model/API → adapter/site → security/cache/link implications → tests.
- For existing reference-frontend work, trace singleton settings → canonical read model → `/api/feed` → `/` → unavailable/errors/external links → browser coverage.
- Search all references before renames. Never invent repository state, test results, Source behavior, or history.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
