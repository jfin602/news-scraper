# News Scraper Boot Document

This is the session initialization contract for repository-aware work in `jfin602/news-scraper`. Read it first in a new ChatGPT/Codex session.

It establishes project identity, canonical terminology, authority, document routing, workflow gates, shorthand commands, and repository safety rails. It is a router/interpreter, not a substitute for specialized contracts, ADRs, implementation docs, tests, or observed validation evidence.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Working product/repository name: News Scraper
- Platform: reusable, topic-independent news aggregation Platform
- Deployment cardinality: exactly one Publication/topic per deployed installation
- Topic reuse model: configure and deploy another installation of the same shared codebase; do not concurrently host multiple topic Publications in one installation
- Publication data-model role: singleton editorial/configuration state, **not** a relational tenant/ownership key
- Current phase: **Phase 10 — Automated polling, durable jobs, and endpoint health**
- Current implementation gate: complete and validate the post-Phase-9 single-Publication simplification correction before ordinary Phase 10 scheduler/job implementation
- Production status: pre-production
- Initial Publication: publishing-industry news relevant to indie authors
- Public direction: canonical root `/` rolling recent-headline feed plus canonical basic API `/api/feed`, sending readers to original publishers
- Admin direction: Cloudflare Access-protected singleton Publication/Source/endpoint/Relevance/Category/Article/duplicate/health/change-history control plane, built after the tech-demo vertical slice
- Core constraint: Publication-specific behavior is configuration; shared engine logic remains topic independent

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication/Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend implementation/validation are complete with durable validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026. Its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in the recorded run because The Creative Penn timed out under the recorded execution environment; owner acceptance advances roadmap state without rewriting that evidence.

On August 11, 2026 the repository owner tightened the architecture before Phase 10 implementation: one installation hosts one Publication/topic; topic independence means code reuse across separately configured deployments; Publication remains singleton editorial configuration but no longer acts as a relational tenancy key; `/` and `/api/feed` are canonical; and obsolete Publication IDs/slugs/FKs/scopes must be removed from the supported forward runtime/data model while real Source/endpoint/run/Article/observation integrity remains. Historical Phase 3–9 migrations/tasks/validation remain truthful evidence for the architecture that existed then.

## Delivery priority

Phases 1–9 are the tech-demo critical path.

The first demonstrable milestone is: at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public feed with original-publisher headline links.

Do not front-load admin convenience, native authentication, feed discovery polish, duplicate moderation, or HTML collection unless a true dependency is demonstrated.

Before ordinary Phase 10 implementation, execute the post-Phase-9 singleton simplification correction. It must flatten obsolete Publication tenancy/scoping, preserve genuine Source/endpoint/run/Article/observation integrity/provenance, remove Publication selectors from bootstrap/Worker/public supported paths, make `/api/feed` and `/` canonical, migrate supported pre-correction data safely, and satisfy the database/regression/browser correction gate in the testing contract.

Every implementation phase and correction inherits `docs/contracts/testing-and-validation-contract.md`. Fast delivery does not permit regression protection, migration/persistence proof, network-safety tests, or final-tree validation to be deferred when the corresponding behavior is introduced or changed.

## New-session startup

For project-wide work refresh:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/roadmap/mvp-roadmap.md`
6. narrowest governing contract/ADR, including `docs/contracts/testing-and-validation-contract.md` for implementation/review work
7. relevant implementation/tests
8. recent commits affecting the area when recency matters

Do not read every document indiscriminately. Use routing below. A full `/docs-review` is the intentional exception.

## Canonical terminology

Governed by `docs/contracts/domain-and-data-contract.md` plus `docs/decisions/single-publication-simplified-data-model.md`.

- `repo` / `source code` = `jfin602/news-scraper`
- `Platform` = reusable aggregation software deployed/configured separately for different topics
- `Publication` = the singleton configured news product/editorial configuration for one installation; **not** a relational tenancy key
- `historical Publication slug/id` = pre-correction identity/scoping used by Phase 3–9 implementation/evidence; not part of the supported forward selector/scoping contract
- `Source` = configured publisher/outlet; approval state determines whether it is trusted for collection
- `Source endpoint` = configured feed/API/HTML location owned by a Source
- `Collection run` = one attempt to collect one endpoint; persisted provenance begins with the first real fetch phase
- `Raw item` = minimally interpreted parser output
- `Article candidate` = normalized but not yet accepted; forward provenance is Source + endpoint + Collection run
- `Article` = persisted normalized Source instance; forward identity is Source-scoped
- `Article observation` = endpoint/run provenance for an Article/candidate outcome, preserving Source consistency
- `Duplicate review candidate` = persisted possible true-duplicate decision/review record
- `Duplicate group` = separately stored Articles representing the same underlying published item
- `Primary article` = one member selected to represent a Duplicate group publicly
- `Related coverage` = distinct reporting about same subject/event; not a true duplicate
- `Category` = installation-wide editorial grouping from singleton Publication configuration
- `Relevance rule` = deterministic installation-wide include/exclude/categorize rule, optionally Source-scoped
- `contract` = behavior implementation must preserve
- `ADR` = decision record in `docs/decisions/`
- `task` = implementation prompt under `docs/tasks/`
- `validation artifact` = durable record under `docs/validation/` of evidence actually observed against a specific source tree/environment; it does not redefine contracts
- `refresh` = re-read current repository sources before answering
- `lock` = treat a decision as authoritative and identify documents that must reflect it

Do not blur removal of relational Publication tenancy with removal of the singleton Publication editorial/configuration concept. Also keep Source vs endpoint, approval vs lifecycle/operational state, operational state vs health, Article identity vs duplicate identity, Article visibility vs duplicate role, external admin access control vs application resource validation, and source inspection vs executed validation evidence distinct.

## Authority and conflicts

Canonical authority is `docs/contracts/project-contract.md`:

1. locked laws;
2. explicit project-contract invariants;
3. domain and lifecycle contracts;
4. architecture, interface, security/operations contracts, and Accepted ADRs;
5. roadmap/implementation notes;
6. root summaries/routing (`AGENTS.md`, `README.md`, `BOOT.md`);
7. implementation;
8. historical task prompts;
9. comments/commit messages/stale notes.

`docs/contracts/testing-and-validation-contract.md` governs how implementation behavior is proven and when implementation/correction work may be considered complete. It does not redefine product/domain behavior or outrank the governing behavioral contract being tested.

Observed validation evidence proves behavior only for the source tree/environment/procedure actually tested; it does not outrank or redefine a governing contract. Historical Phase 3–9 evidence must continue to describe the Publication-scoped schema/routes actually tested even after the forward contract removes that tenancy.

Current user instruction controls task scope. A proposed locked-law change is a contract-change request, not permission for lower-authority work to override it silently.

Report authoritative conflicts rather than choosing silently.

## Document routing

| Area | Read first |
| --- | --- |
| Locked laws / authority / product boundaries | `docs/contracts/project-contract.md` |
| MVP users / demo-first capabilities / exclusions | `docs/contracts/mvp-scope-and-users.md` |
| Terminology / singleton model / entities / identity / provenance / migration | `docs/contracts/domain-and-data-contract.md` |
| Testing / regression / evidence / DB/fixture/browser/live validation | `docs/contracts/testing-and-validation-contract.md` |
| Process/module architecture / deployment / Worker / scheduling / transactions | `docs/architecture/system-architecture.md` |
| Approval / bootstrap / collection / safety / normalization / Relevance / identity / run accounting | `docs/contracts/source-and-collection-contract.md` |
| Article visibility / duplicate role / review/groups / Primary | `docs/contracts/article-lifecycle-and-deduplication.md` |
| Public feed / root routing / search / themes / admin UX / change history | `docs/contracts/public-feed-and-admin-contract.md` |
| Admin perimeter / SSRF / content safety / isolation / observability / recovery | `docs/operations/security-reliability-and-operations.md` |
| Phase sequence / correction gate / exit gates | `docs/roadmap/mvp-roadmap.md` |
| Current singleton Publication data-model decision | `docs/decisions/single-publication-simplified-data-model.md` |
| Historical superseded single-Publication/scoped model | `docs/decisions/topic-independent-publication-model.md` |
| Whitelist/structured-feed decision | `docs/decisions/whitelist-and-structured-feed-first.md` |
| Original-link/normalization decision | `docs/decisions/original-link-and-normalized-metadata.md` |
| Cloudflare Access admin perimeter | `docs/decisions/cloudflare-access-admin-perimeter.md` |
| Documentation index | `docs/README.md` |
| Specialized validation plans | `docs/testing/` when present |
| Implementation prompts | `docs/tasks/` when present |
| Durable validation artifacts | `docs/validation/` when present |

If a path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared engine code remains topic independent.
- Each supported deployed installation hosts exactly one Publication/topic; another topic uses another configured deployment of the same codebase.
- Singleton Publication configuration owns installation-wide name, collection/public state, branding/presentation, Categories, Relevance, Sources, and Source priority conceptually.
- Publication is not a relational tenant key in the forward model. Do not preserve/reintroduce Publication UUIDs, slugs, FKs, joins, composite uniqueness scopes, API/repository parameters, admin authorization scopes, or compatibility aliases solely for hypothetical concurrent hosting.
- Source `config_key` is installation-wide; endpoint `config_key` remains Source-scoped.
- Source owns endpoints and Articles; endpoints own Collection runs; observations preserve endpoint/run and Article/Source consistency. Simplification MUST NOT weaken these real relationships.
- Forward Article candidate provenance excludes redundant Publication identity and retains Source + endpoint + Collection run.
- Article identity is Source-scoped: strong external ID first, canonical URL fallback second, explicit adapter key only when concrete need exists.
- Historical migrations/tasks/validation remain unchanged; the singleton correction adds a later migration rather than rewriting accepted history.
- The flattening migration must make fresh migration-from-zero and representative existing one-Publication state converge on the corrected schema and must fail clearly on ambiguous pre-correction multi-Publication state.
- Canonical public page is `GET /`; canonical basic public feed API is `GET /api/feed` after the correction.
- The historical Phase 8/9 slug-addressed route evidence remains historical truth and is not rewritten to claim root-route validation.
- Phase 10 implementation is gated until the full singleton simplification correction receives required PostgreSQL/regression/browser evidence and a durable correction validation artifact.
- Source/endpoint approval/trust, lifecycle (`active/archived`), operational state (`enabled/paused/disabled`), and derived health are distinct.
- Bootstrap may explicitly create approved configuration as operator input but may not auto-discover/auto-approve, infer approval from fetch success, widen domains silently, or overwrite later operator-managed state on normal startup.
- Forward bootstrap/Worker/runtime paths do not select a Publication slug/id; singleton Publication state is installation configuration.
- Only approved + active + operationally enabled Sources/endpoints are contacted while singleton Publication `active_for_collection` is true.
- Every request/redirect passes pre-fetch network-safety validation before contact.
- Parsed Article links pass a separate post-normalization Source/domain gate.
- Source approved domains are the maximum boundary; endpoint rules may narrow, not silently widen.
- Parsers output Raw items and never persist Articles directly.
- Source-shaped data is normalized before Relevance, identity, duplicate, or feed use.
- Relevance ordering is never bypassed: before configurable rules exist the empty rule set deterministically returns `include`; later rules are installation-wide with optional Source scope.
- Configurable MVP Relevance edits are prospective by default; automatic bulk historical reprocessing is deferred.
- Article identity is transactionally idempotent.
- Article observations preserve endpoint/run provenance.
- Minimal Collection-run persistence begins with the first real fetch in Phase 5 and expands as pipeline stages are introduced.
- During Phases 5–9, collection was manually invoked through the Worker; Web/API never fetches Sources inline.
- Phase 10 adds durable scheduling/jobs around the same endpoint execution unit and does not add multi-Publication scheduling or tenancy.
- True-duplicate grouping applies to separately stored Articles; duplicate state is installation-wide and preserves every Article/observation.
- Article visibility is independent from duplicate role; before Duplicate groups exist, Articles are logically `ungrouped`.
- Ordinary public-feed eligibility requires singleton `public_status = public`, an approved active Source, and a visible Article that is `ungrouped` or the `primary` member once grouping exists.
- Publication collection activity, Source operational state, and endpoint approval/lifecycle/operational/health state govern collection and do not by themselves suppress retained otherwise-eligible public rows.
- Public feed effective date uses parsed `published_at` when available and otherwise `first_seen_at`, with fallback provenance detectable and deterministic tie ordering.
- Public headline destination is stored Article `original_url`; `canonical_identity_url` remains an identity-comparison field and is not substituted silently.
- Until Publication presentation timezone/settings exist, the basic public UI renders the calendar date from `effectiveFeedDate` in UTC.
- Absent singleton Publication configuration and non-public configuration remain indistinguishable on public page/API and use the same generic unavailable/not-found behavior.
- Weak duplicate evidence persists as review state; unchanged dismissed evidence does not recur indefinitely.
- Source runs/jobs fail independently and public-feed reads remain readable during collection failures.
- MVP admin UI/API routes are behind Cloudflare Access and supported deployments prevent direct-origin bypass.
- State-changing admin browser actions use CSRF/equivalent request-integrity controls; application commands validate real resource relationships/domain invariants rather than obsolete Publication tenancy.
- Native application administrator accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP.
- Push/webhook adapters and pinning/featured ordering are deferred beyond MVP unless explicitly promoted.
- Every implementation change requires focused automated coverage and relevant broader regression coverage under the testing contract.
- Persistence/concurrency/migration claims require the evidence level capable of proving real PostgreSQL behavior; mocks do not substitute for database guarantees.
- Ordinary deterministic validation does not rely on live public Sources and must not weaken production whitelist/SSRF policy.
- Required suites do not pass by silently skipping prerequisites or selecting zero tests.
- Validation claims apply to the exact final source tree tested; previous passing evidence does not automatically transfer to later source changes.
- Phase 9 roadmap progression was explicitly accepted on August 11, 2026 despite the durable artifact recording the incomplete two-Source Level 7 observation; this owner exception does not rewrite the evidence.
- Roadmap phase closeout and the gating singleton correction closeout require durable `docs/validation/` evidence tied to the exact accepted source tree when required by the testing contract.

## Roadmap state

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 10 — Automated polling, durable jobs, and endpoint health**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration core, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend are complete with durable closeout validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026 with the recorded live-source limitation preserved.

### Tech-demo critical path

1. Phase 1 — Application foundation
2. Phase 2 — Database foundation
3. Phase 3 — Publication and Source configuration core
4. Phase 4 — Collection eligibility and network safety
5. Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs
6. Phase 6 — Article normalization
7. Phase 7 — Default Relevance, Article identity, and persistence
8. Phase 8 — Basic public-feed backend
9. Phase 9 — Basic public-feed UI and tech demo

### Current implementation gate

- **Post-Phase-9 single-Publication simplification correction** — flatten obsolete Publication tenancy/scoping; preserve Source/endpoint/run/Article/observation integrity; remove Publication selectors from supported bootstrap/Worker/public paths; migrate existing one-Publication state safely; reject ambiguous multi-Publication migration state; make `/api/feed` and `/` canonical; execute required database/regression/browser validation; write a durable correction validation artifact.

This is a non-versioned correction stack, not a new roadmap phase. It preserves the current package version and returns directly to Phase 10 when green.

### Current implementation phase after gate

10. Phase 10 — Automated polling, durable jobs, and endpoint health

### Remaining MVP order

11. Phase 11 — Categories and configurable Relevance execution
12. Phase 12 — Feed discovery features
13. Phase 13 — Public presentation polish
14. Phase 14 — Source administration
15. Phase 15 — Publication and Relevance administration
16. Phase 16 — True duplicate detection and grouping
17. Phase 17 — Article and duplicate moderation
18. Phase 18 — Configurable HTML collection
19. Phase 19 — Reliability, observability, and production operations
20. Phase 20 — Customer launch validation

Do not advance by assumption. Verify each phase/correction exit gate plus the inherited testing-and-validation gate against the final tree before updating state.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe prompts.
- State allowed files when knowable.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests and identify evidence levels needed for acceptance.
- Do not claim runtime/browser/database/live-Source behavior unless observed at the corresponding evidence level.
- Prefer smallest correct incremental change and simplest supported architecture over speculative future-proofing.
- Trace shared helpers/consumers before changes.
- Before singleton-correction changes trace historical migrations/schema → Publication/bootstrap repositories → Source/endpoint repositories → Worker/manual selectors → candidate provenance → Article identity/observations → feed read model/routes/page → fixtures/tests/browser.
- Before collection changes trace singleton `active_for_collection` → Source/endpoint approval/lifecycle/operational state → execution → lock → Collection run → network safety → fetch/redirect → parse → normalize → Article-link validation → Relevance → Source-scoped identity → observation → run accounting → health → tests.
- Before Article/duplicate changes trace external IDs/canonical URLs/uniqueness → observations → review candidates → groups → Primary → moderation → feed → tests.
- Before admin changes trace Cloudflare Access perimeter → origin protection → request integrity → real resource relationships/domain invariants → mutation → change history → tests.
- Before public-route changes trace singleton Publication settings → canonical read model → `/api/feed` → `/` page/client → unavailable/error behavior → external links → browser tests.
- Before approving a change, trace testing blast radius and confirm relevant regression suites were actually executed against the reviewed final tree.
- For implementation-roadmap phase or gating correction closeout, require observed local terminal evidence and the required durable validation artifact tied to the exact accepted source tree.
- Make a concrete choice when asked for `recommended`.
- Never invent repository state, tests, browser results, Source behavior, or history.

# Conversation commands

Commands are conversational shorthand, not shell commands.

## Context

### `/boot`
Refresh BOOT, root summaries, project contract, roadmap, and narrow governing docs.

### `/refresh <area>`
Re-read relevant source/docs/tests/recent commits.

### `/state`
Summarize implementation state, active phase, completed work, constraints, next logical work.

### `/route <topic>`
Identify governing contracts/ADRs/source/tests/tasks.

## Analysis

### `/audit <area>`
Compare contracts, ADRs, source, tests, recent changes, observable behavior; report disagreements/risks.

### `/contract-check <area>`
Check implementation/tests against governing contracts/laws.

### `/doc-check <area>`
Narrow documentation consistency check; does not replace full `/docs-review`.

### `/source-trace <source or behavior>`
Trace singleton configuration → Source → endpoint → approval/lifecycle/operational state → execution/lock/run → safety → fetch → parse/normalize → link validation → Relevance → Source-scoped identity/observation → duplicate → run/health → consumers/tests.

### `/article-trace <field or concept>`
Trace Raw item → candidate → Relevance → Source-scoped Article identity/persistence → observations → overrides → duplicate role → feed/admin/tests.

### `/dedupe-trace <case>`
Trace Article identity separately from true-duplicate evidence, review state, groups, Primary, safeguards, moderation, feed/tests.

### `/blast-radius <change>`
Identify affected contracts, ADRs, schema/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`
Trace suspected regression to likely change, affected invariants, missing test protection, and evidence level required to prove a fix.

# Phase handoff workflow

After an implementation roadmap phase has been formally closed by its closeout task and durable validation record, use:

```text
phase implementation / closeout task
→ /closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

A green `/closeout` establishes the next implementation phase by committing its `0.<phase>.0` package baseline. Because `/closeout` is intentionally version-only, roadmap/root phase summaries may still identify the just-completed phase until the immediately following `/docs-review` → `/docs-apply` alignment. This short state is expected and is not itself repository drift.

A correction stack has its own final manual closeout prompt, but that prompt is **not** `/closeout`. Correction closeout validates and clears only the named correction/gate while preserving the declared unchanged package version; it does not advance the roadmap phase or create a new `.0` baseline.

## `/closeout`

`/closeout` is a bounded phase-handoff state transition, not an audit or troubleshooting workflow. Under normal repository/tool conditions, target completion is under 60 seconds.

### Fast path

1. Read this `/closeout` section and roadmap entries needed to identify the completed phase and intended next phase.
2. Read the completed phase's durable validation artifact and extract the accepted/validated implementation source SHA and exit-gate conclusion.
3. Read `package.json` as sole project-version authority and completed phase task filenames/version sequence. Do not require/search npm lockfile metadata.
4. Perform one accepted-SHA-to-current-`main` compare to classify post-validation drift. Documentation-only changes and explicitly owner-approved non-executable workflow/tooling-policy changes are non-blocking when they do not modify runtime behavior, tests, migrations, committed configuration, `package.json` dependency/script/engine metadata, or other executable product behavior. Relevant executable drift is blocking.
5. If green, perform only the next-phase baseline version transition below.
6. Verify transition diff, then re-read `docs/roadmap/mvp-roadmap.md` and print the complete entry for the phase being entered.

Required structural checks:

- completed phase artifact states its exit gate is satisfied and intended next phase is identifiable;
- artifact identifies accepted/validated implementation source SHA;
- single post-validation compare shows no unvalidated executable/dependency/test/migration/runtime/config drift;
- root/roadmap phase state is coherent enough for handoff even if docs alignment awaits `/docs-apply`;
- `package.json` contains expected completed-phase version;
- task/version sequence is coherent with no obvious blocking stale artifacts.

The repository intentionally does not use `package-lock.json`; its absence is expected and never itself a blocker.

### Time and scope guardrails

- Do not rerun full validation, tests, runtime, database, browser, or live-Source checks during `/closeout`.
- Do not perform broad contract/document/source review; `/docs-review` owns that.
- Do not walk every post-validation commit when one range comparison can classify drift.
- If relevant unvalidated drift exists, report `Closeout check blocked` and stop without root-cause investigation.
- If required state cannot be established quickly because a safe primitive is unavailable, report blocker rather than expanding into open-ended investigation.
- The version transition gets one predetermined safe write strategy. Do not cycle alternate write mechanisms or hand-build Git objects to overcome connector limitations.
- Do not run `npm install` merely to change version.

### Green-path version transition

Invocation of `/closeout` constitutes explicit repository-owner authorization for this version-only transition when structural check is green.

Capture pre-transition `main` SHA. Update exactly one JSON value to `0.<next roadmap phase>.0`:

- `package.json` top-level `version`.

Preserve every other package value. Commit version-only transition directly to `main` unless branch/PR requested. Immediately compare pre/post SHAs; complete range MUST change only `package.json` and exactly the expected version value. Otherwise report `Closeout transition invalid` and stop.

### Required final output

A successful `/closeout` response MUST contain, in order:

1. `Closeout check: GREEN`;
2. resulting baseline transition commit SHA/final SHA;
3. `Next P1 version: 0.<new phase>.1`;
4. complete roadmap entry for the phase being entered, freshly re-read rather than summarized from memory.

# Documentation workflow

## `/docs-review`

Always a **read-only first pass**.

Default full scope: every tracked `.md` and `.txt` except:

- `docs/tasks/`
- `docs/validation/`

Conversation may narrow scope explicitly.

Return interpreted scope, reviewed/excluded docs, contradictions, source/docs drift when applicable, stale statements, duplicated/misplaced authority, missing cross-references, routing issues, recommended changes by file, and application order.

Never modify files during `/docs-review`.

## `/docs-apply`

Apply only approved findings/change groups from current conversation.

Before editing, re-read targets and confirm drift has not invalidated findings.

Invoking `/docs-apply` explicitly authorizes approved **documentation-only** edits directly on `main` unless the user requests a branch/PR. It does not authorize source changes, unrelated cleanup, history rewriting, or unapproved docs edits.

After applying, report changed files, addressed/unapplied findings, newly discovered conflicts, and remaining validation.

# Prompt workflow

Strict order:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Do not silently run missing stages. If unstable requirements, contradictory docs, repository drift, or a material decision blocks progress, return `Planning needed` and stop before next stage.

## Codex task-stack prompt-file grammar

The phase runner and parse-only validator share the same executable parser in `scripts/codex-phase-core.mjs`. Runner supports two explicit stack modes: versioned roadmap phase stacks and non-versioned correction stacks. Parser changes MUST update this section and focused regression tests in the same change.

Use `npm run codex:phase:validate -- <task-folder>` to validate either stack type without launching Codex, changing package version, modifying working tree, or committing.

### Common grammar

Both stack types require:

- every `.txt` file in task folder is a prompt;
- filenames are canonical `P<number>-<lower-kebab-slug>.txt`, one-based/no-leading-zero, unique, contiguous from P1;
- every prompt contains exactly one literal `- Recommended configuration:` line with one backtick-delimited current `MODEL_CONFIGS` label and final period;
- exactly one prompt is closeout and it is final/highest-numbered;
- closeout classification requires both filename slug to contain a `closeout` segment and parsed `TASK:` title to contain word `closeout`; disagreement fails parsing;
- implementation prompt filename/TASK title must not signal closeout; body prose may mention closeout freely;
- closeout is parsed into plan but never executed by `codex:phase`; automation stops after implementation prompts.

### Roadmap phase stacks

- folder canonical lowercase `p<number>` with no leading zero;
- task header exactly `TASK: Phase <phase> / P<number> — <title>` and agrees with folder/filename;
- each prompt contains exactly one literal phrase `assigned project version is` followed by one backtick-delimited semantic version;
- parsed target equals `0.<folder phase>.<prompt number>`;
- roadmap prompt MUST NOT contain correction unchanged-version metadata.

### Non-versioned correction stacks

Correction stacks are for owner-approved bounded implementation gates/regressions/architectural corrections that need sequenced prompts and final manual closeout without consuming roadmap prompt versions.

- folder canonical `c<roadmap-phase>-<lower-kebab-slug>`, e.g. `c10-single-publication`; referenced phase provides context only;
- task header exactly `TASK: Correction <phase> / P<number> — <title>` matching folder numeric component;
- each prompt contains exactly one literal line `- Required unchanged project version: `<version>`.` with one backtick-delimited semantic version;
- every prompt declares same unchanged version, equal to `package.json` throughout execution;
- correction prompts MUST NOT contain `assigned project version is` metadata;
- correction P-numbers are local ordering and do not consume/reserve roadmap patch numbers;
- correction commit subjects identify correction stack/prompt, e.g. `c10-single-publication/P1: <task title>`;
- correction closeout validates/clears only correction, does not invoke/substitute for `/closeout`, and does not advance package version.

Parser does not infer stack mode/model/version/order/closeout from free-form narrative prose. Machine-significant metadata must use explicit forms above.

Before `/prompt-write` reports either stack ready:

1. re-read current parser/runner if changed since planning;
2. verify folder against applicable machine grammar;
3. when repository execution available, run `npm run codex:phase:validate -- <task-folder>` and require green;
4. connector-only work performs equivalent parser-level source check and explicitly says it was source-validated rather than executed;
5. do not recommend automation while parser/validator inconsistency remains.

Runner fail-closed execution invariants: clean working tree, no `package-lock.json`, coherent `git diff --check`, actual implementation changes, clean single-successor prompt commit boundary. Phase stacks also enforce expected version chain. Correction stacks enforce one unchanged package version before/after every prompt and commit.

## Prompt model/reasoning and usage selection

Every implementation and closeout task MUST carry an explicit recommended Codex model/reasoning configuration and token/credit-usage estimate. Model choice and reasoning effort are separate dimensions; there is no repository-defined linear ladder such as `Terra Max` or `Sol Max`.

Use exact model/reasoning labels currently available. Never invent a name.

### Quality-first selection rule

1. Determine task complexity/quality floor from correctness risk, security impact, data integrity, architecture/blast radius, concurrency/transaction ownership, failure handling, and validation difficulty.
2. Identify configurations with enough reasoning headroom.
3. Only among adequate configurations, prefer expected lower token/credit use.
4. Never reduce capability/reasoning solely to save tokens when it materially increases implementation/review risk.

Cost is an optimization constraint after quality. Do not assume cheaper-per-token model at max reasoning is cheaper overall than stronger model at lighter reasoning.

### Complexity / quality classes

| Class | Typical task shape |
| --- | --- |
| `Standard` | Bounded implementation, leaf modules, straightforward migrations/repositories, deterministic tests, contained refactors. |
| `Elevated` | Subtle validation/state behavior, security-sensitive narrow policy, meaningful persistence semantics, difficult edge cases. |
| `High` | Cross-cutting integration, multiple interacting modules, concurrency/transaction ownership, shared infrastructure, high-risk security, broad regression surface. |
| `Critical` | Exceptional work combining several high-risk dimensions where strongest available reasoning is materially justified. |

### Required usage estimate

`/prompt-ass` and `/prompt-plan` provide for each prompt:

- **Recommended configuration:** exact current model + reasoning choice.
- **Complexity / quality floor:** `Standard`, `Elevated`, `High`, or `Critical`, with concise rationale.
- **Estimated usage:** `Low`, `Moderate`, `High`, or `Very High`.
- **Alternative considered:** relevant cheaper/differently balanced configuration.
- **Efficiency rationale:** why recommendation best balances quality/usage.
- **Estimate confidence:** `Low`, `Medium`, or `High` when meaningful.

When current official OpenAI Codex token/credit rates are available, use them instead of stale repository numbers. Do not invent precise counts when uncertain. Expensive recommendations should explicitly consider whether a lower reasoning level or stronger model at lighter reasoning still meets quality floor.

### Workflow ownership

- `/prompt-ass` assigns provisional recommendation/complexity/usage/alternative/rationale.
- `/prompt-plan` reassesses after source-level investigation and may raise or lower cost only while preserving quality floor.
- `/prompt-write` writes finalized `MODEL / REASONING / USAGE` block.
- Material boundary/quality change during revalidation returns `Planning needed` rather than silently changing approved plan.
- `/revalidate` compares existing prompt/stack to current repo/contracts/model-usage policy.
- Historical completed prompts may retain model/effort wording in force when executed; unexecuted obsolete labels require revalidation.

## Versioning and phase-prompt numbering

Project versions use `0.<roadmap phase>.<phase prompt number>` for roadmap phase stacks while pre-1.0.

- Prompt numbers one-based; `P0` not used.
- Roadmap task number maps to version patch number.
- `0.<phase>.0` is phase baseline established only by green `/closeout` or separately explicit owner-authorized `.0` transition.
- `package.json` is sole current-version authority; project intentionally has no npm lockfile.
- Do not duplicate current version in root summaries/contracts/source constants.
- Version changes occur only through executed Codex roadmap prompt, green `/closeout`, or separately explicit owner-authorized `.0` transition after prior phase closes.
- Non-versioned correction stacks MUST NOT change `package.json`; P-numbers are local sequencing only.
- Roadmap prompt reruns retain assigned version; correction reruns retain unchanged version.
- Roadmap prompts verify expected preceding/same-rerun version, update `package.json`, avoid lockfile, and validate versioned tree.
- Correction prompts state one required unchanged version, verify it, forbid changing it, avoid lockfile, and validate unchanged-version invariant.
- Roadmap closeout prompt that owns a version change commits it before final source SHA validation; later `/closeout` performs separate next-phase `.0` transition.
- Correction closeout never transitions package version and is not automatically followed by `/closeout`.
- Post-Phase-9 singleton simplification is the intended first non-versioned correction stack and must preserve package version throughout.

## `/prompt-ass`

Determine safe task boundaries from established behavior/contracts/roadmap. No writes.

Return target behavior, constraints, roadmap phase, stack type (`phase` or `correction`), prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior, closeout task when needed, and per-prompt provisional model/complexity/usage/alternative/confidence/rationale. For correction stacks, identify correction slug and package version that must remain unchanged from `package.json`.

Testing is part of task-boundary assessment: each prompt should own focused tests and appropriate broader regression impact without becoming monolithic.

## `/prompt-plan`

Requires completed `/prompt-ass` in current conversation. Perform source-level planning for every assessed prompt: contracts/ADRs, implementation, schemas/migrations, process roles, helpers/consumers/tests/recent changes, likely file scope, preserved behavior, risks, focused tests, broader regression tests, required evidence levels, runtime/browser/database/fixture/live-Source validation, docs implications, acceptance criteria, non-goals.

Reassess model/reasoning/complexity/usage/alternative/rationale. Complexity/correctness supersedes estimated cost. Reconfirm stack type and correction unchanged-version invariant. Material boundary revisions produce `Planning needed`. No writes.

## `/prompt-write <folder name>`

Requires completed unblocked `/prompt-plan`. Revalidate current repo/docs and write one ordered `.txt` per approved prompt under `docs/tasks/<folder name>/`.

Roadmap phase folders use `p<number>`. Correction folders use `c<roadmap-phase>-<lower-kebab-slug>`.

Each prompt includes finalized `MODEL / REASONING / USAGE` block. Roadmap tasks use assigned-version metadata; correction tasks use required-unchanged-version metadata.

After writing, perform applicable runner prompt-file grammar check before reporting ready. If revalidation reveals materially changed boundary, stack type, unchanged-version invariant, or quality floor, return `Planning needed` rather than silently changing approved plan. Do not overwrite existing tasks without explicit authorization.

## Supporting prompt commands

- `/prompt <task>` — one prompt in conversation only.
- `/stack <goal>` — legacy shorthand for `/prompt-ass`.
- `/split <task>` — narrow assessment shorthand.
- `/revalidate <task or stack>` — compare existing tasks to current repo/contracts/model-usage policy and report grammar/version/config adequacy/efficiency.

# Review and validation commands

- `/review <commit, PR, task, implementation>`
- `/prove <behavior>`
- `/test-matrix <feature>`
- `/collector-check <source or collector>`
- `/dedupe-check <rule or case>`

Honor current contracts, state separation, security, provenance, idempotency, failure isolation, feed eligibility, and testing contract. Reviews distinguish inspection from executed evidence.

# Decision commands

### `/lock <decision>`
Treat decision as authoritative direction and identify affected contracts/ADRs/root/task docs. Do not modify files unless instructed. Locked-law amendments use project-contract process.

### `/recommend`
Choose best option using contracts, architecture, roadmap, user value, security/reliability, implementation risk.

### `/status`
Return only: Completed / Current / Blocked / Next.

### `/next`
Recommend the single most logical next task.

# Command modifiers

`--deep`, `--quick`, `--docs-only`, `--code-only`, `--no-write`, `--prompt-only`, `--file-scoped`, `--regression-safe`, `--latest`, `--browser`, `--db`, `--tests`, `--contracts`, `--sources`, `--dedupe`, `--security`, `--reassess`.

# Codex prompt requirements

Finished implementation prompts normally include Task, Context, Current/Required behavior, roadmap phase, stack type, finalized `MODEL / REASONING / USAGE` block, governing contracts/ADRs/laws, inspected source, allowed/forbidden files, constraints, preserved behavior, applicable security/provenance/idempotency/failure-isolation implications, risks, focused tests, broader regression tests, required evidence levels, runtime/browser/database/fixture/live-Source validation, docs updates, acceptance criteria, and non-goals.

Machine-significant fields are stricter than prose. Every task uses canonical folder/filename numbering, one canonical `TASK:` header, one exact recommended-configuration line, and filename-plus-`TASK:` closeout convention. Roadmap prompts additionally use exactly one `assigned project version is ...` phrase. Correction prompts instead use exactly one required-unchanged-version line and MUST NOT use assigned-version metadata.

Every implementation prompt inherits testing contract. Tests are not optional cleanup; prerequisites cannot silently skip green; claims cannot exceed evidence.

Collection prompts preserve singleton Publication global collection-active state, Source/endpoint approval/lifecycle/operational boundaries, truthful Collection runs, pre-request network safety, run isolation, retry limits, Source-domain policy, and deterministic collection tests without safety bypasses. They do not add Publication selectors/tenant scopes.

Persistence/identity prompts preserve Source-scoped Article identity, canonical Relevance ordering, transactional idempotency, Article observations, real-PostgreSQL constraints/concurrency/migration behavior where applicable, and rollback. Publication tenancy is not reintroduced as future-proofing.

Duplicate prompts preserve every Article/observation, exactly one Primary/group, review-state persistence, false-positive safeguards, manual reversibility, and regression corpus coverage; duplicate state is installation-wide.

Publication/Relevance prompts preserve topic independence, singleton Publication configuration, installation-wide plus Source-scoped Relevance, deterministic precedence, prospective-by-default edits, and full precedence-matrix tests. They do not create Publication tenant FKs/scopes.

Public-feed prompts preserve singleton public exposure, Source approval/lifecycle trust, Article visibility + ungrouped-or-Primary eligibility, deterministic published-at/first-seen semantics, bounded safe output, and stored `original_url`. Forward routing is `GET /` and `GET /api/feed`; no Publication selector/scoping argument. Historical Phase 8/9 evidence remains accurate and is not rewritten.

Admin prompts preserve Cloudflare Access/origin protection, request integrity, real resource-relationship/domain-invariant validation, singleton Publication configuration, and prohibition on unnecessary native identity/account work, multi-Publication selectors, or Publication tenant authorization.

The post-Phase-9 singleton correction prompts additionally preserve historical migrations/evidence, add a new migration, require ambiguous multi-Publication state to fail, and must prove migration/data preservation plus browser behavior before correction closeout.

# Repository modification rules

- Do not modify/commit unless authorized by current request/command.
- `/closeout` performs only bounded handoff verification and green-path version-only `package.json` transition.
- A correction stack's final manual closeout validates/clears correction while preserving unchanged package version/active phase.
- `/docs-review` never writes.
- `/docs-apply` writes only approved docs; invocation authorizes documentation-only changes on `main` unless branch/PR requested.
- `/prompt-ass` and `/prompt-plan` never write.
- `/prompt-write` writes only approved task files in established phase/correction folder.
- Documentation/prompt/review activity does not change package version except explicit `/closeout` baseline transition; correction execution is non-versioned.
- No task writes while `Planning needed` remains unresolved.
- No speculative compatibility bridges or permanent dual schemas.
- No topic conditionals in shared engine code.
- No concurrent multi-topic/multi-Publication hosting behavior inside one installation unless later explicit locked contract/ADR authorizes it.
- Do not preserve/reintroduce relational Publication tenancy, IDs, slugs, FKs, uniqueness scopes, selector parameters, or authorization scopes solely because concurrent hosting might be useful someday.
- Do not remove singleton Publication editorial/configuration behavior or genuine Source/endpoint/run/Article/observation integrity while flattening tenancy.
- No public/Worker/bootstrap runtime Publication selector whose purpose is choosing among topics in one installation.
- No Source/endpoint approval/state bypass or silent whitelist expansion.
- No parser-to-Article direct persistence.
- No Web/API inline Source fetching.
- No bypass of Relevance boundary even before configurable rules exist.
- No deletion of Article/observation provenance because duplicate suppression exists.
- No weakening identity/duplicate/security/testing boundaries to make tests pass.
- No silent-green required suite caused by missing prerequisites, skipped coverage, or zero matches.
- No MVP native administrator account/session/role subsystem unless explicitly promoted.
- Search all references before renames.
- Do not report tests/runtime/browser/database/live-Source behavior as verified unless observed at appropriate evidence level.
- Do not create PRs, merge, force-update history, or perform non-document history changes unless explicitly instructed.
- Preserve smallest viable diff for scoped fixes.

# Pre-production compatibility rule

Prefer one canonical design. Do not add old/new aliases, duplicate synchronized fields, fallback paths, dormant tenant columns, or speculative migration compatibility unless explicitly required. The correction may include a one-time migration from the accepted historical schema, but the resulting supported model should not retain permanent Publication tenancy or slug-addressed compatibility paths solely because they existed before correction.

# Boot maintenance

Update BOOT when phase, core paths, terminology, commands, authority, locked laws, modification conventions, task-stack grammar, versioning/prompt-numbering conventions, branch, repository identity, critical delivery ordering, foundational security/deployment/data-model decisions, or project-wide testing/validation policy changes.
