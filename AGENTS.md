# AGENTS.md

## Project Name

News Scraper

## Project Goal

Build a reusable, topic-independent news aggregation Platform that collects Article metadata only from administrator-approved Sources, normalizes Source-specific input, persists Articles idempotently with endpoint/run provenance, suppresses true duplicates without destroying Source instances, and serves a rolling feed whose headlines link to original publishers.

Each deployed installation hosts exactly one Publication/topic. The first configured deployment is publishing-industry news relevant to indie authors. That topic is singleton Publication configuration, not aggregation-engine identity. A different topic reuses the same codebase through a separately configured deployment rather than being added as another live Publication in the same installation.

The canonical customer-visible feed is the deployment root `/` and the canonical basic feed API is `/api/feed`. Publication is not a relational tenancy key in the forward data model; do not preserve Publication IDs/slugs/FK scopes merely for hypothetical concurrent hosting.

## Documentation Workflow

Follow `BOOT.md`.

- `/closeout` is the phase-handoff command after a roadmap phase has formally closed. It performs a quick closeout/evidence check and, only when green, advances `package.json` to `0.<next phase>.0`.
- A correction stack may also contain a final manual closeout prompt, but that correction closeout is not `/closeout`; it clears only the correction/gate and preserves the active roadmap phase/package version.
- `/docs-review` is always a read-only first pass.
- Do not modify documentation during review/cleanup/alignment until findings are approved or `/docs-apply` is invoked.
- `/docs-apply` authorizes only approved documentation changes and may commit them directly to `main` unless the user requests otherwise.
- Preserve unrelated wording during scoped documentation fixes.
- Normal phase handoff follows `/closeout` → `/docs-review` → `/docs-apply` → `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.

## Versioning Workflow

Follow the canonical versioning and prompt-numbering rules in `BOOT.md`.

- Roadmap phase stack prompt filenames are one-based: `P1`, `P2`, `P3`, and so on; do not create `P0` tasks.
- Roadmap phase project versions use `0.<roadmap phase>.<phase prompt number>` while pre-1.0.
- `0.<phase>.0` is the roadmap phase baseline. After a roadmap phase formally closes, `/closeout` is the canonical handoff: it verifies the closeout and, on a green result, performs the next `0.<new phase>.0` transition. That transition consumes no prompt number; P1 still maps to `.1`, P2 to `.2`, and so on.
- Invoking `/closeout` constitutes explicit repository-owner authorization for its green-path version-only transition. The baseline never changes merely because a phase appears complete.
- `package.json` is the sole authoritative current-version source; do not duplicate the current version in root docs or source constants. Task prompts may declare a target/unchanged version because runner execution validates that metadata against `package.json`.
- The project intentionally does not use npm package locks. Repository npm configuration disables `package-lock.json` generation; dependency installation uses `package.json` rather than lockfile metadata.
- Project version changes occur only through execution of a new Codex roadmap-phase prompt, a green `/closeout` transition, or another explicit owner-authorized `.0` transition after the prior phase closes. Other documentation/prompt/review workflow activity does not increment the version.
- Non-versioned correction stacks do not change `package.json` version. Their P-numbers are local ordering only and do not consume/reserve roadmap phase patch numbers.
- Roadmap prompt reruns keep their assigned version. Correction prompt reruns keep their declared unchanged version.
- The post-Phase-9 single-Publication simplification correction is a Phase 10 entry correction, not a new numbered roadmap phase, and uses a non-versioned correction stack rather than consuming Phase 10 patch numbers.

## Codex Task Stack Grammar

Follow the machine-parsed prompt-file grammar in `BOOT.md`; `scripts/codex-phase-core.mjs` is the executable parser and parser changes must update BOOT plus focused regression tests in the same change.

Common rules:

- Prompt files use canonical `P<number>-<lower-kebab-slug>.txt`; numbering is one-based, unique, and contiguous from P1.
- Each prompt has exactly one recommendation line using the literal prefix `- Recommended configuration:` followed by one backtick-delimited label and a final period. The label must exist in the runner's current `MODEL_CONFIGS`; never invent a label such as `Terra Max`.
- Exactly one final prompt is the manual closeout. Closeout identity is determined only when the filename slug contains a `closeout` segment and the parsed `TASK:` title contains the word `closeout`; if only one contains it, parsing fails. Prompt body prose may mention closeout without changing prompt kind.
- Before reporting `/prompt-write` complete, validate the written folder against the current parser. When local execution is available run `npm run codex:phase:validate -- <task-folder>`; connector-only work must perform the equivalent source-level parser check explicitly.
- `npm run codex:phase -- <task-folder>` runs implementation prompts only and stops before the parsed closeout prompt.

Roadmap phase stacks:

- Folder is canonical lowercase `p<number>` with no leading zero.
- Task header is exactly `TASK: Phase <phase> / P<number> — <title>` and must agree with folder/filename.
- Each prompt has exactly one `assigned project version is` phrase followed by one backtick-delimited semantic version; target is `0.<folder phase>.<prompt number>`.
- Roadmap prompts must not contain correction unchanged-version metadata.

Non-versioned correction stacks:

- Folder is canonical `c<roadmap-phase>-<lower-kebab-slug>`, for example `c10-single-publication`.
- Task header is exactly `TASK: Correction <phase> / P<number> — <title>` and the phase must match the folder numeric component.
- Each prompt has exactly one `- Required unchanged project version: `<version>`.` line, every prompt in the stack declares the same version, and that version must equal `package.json` throughout execution.
- Correction prompts must not contain `assigned project version is` metadata.
- Correction P-numbers do not consume roadmap patch numbers.
- Correction commit subjects identify the correction stack/prompt instead of impersonating package-version commits.
- Correction closeout validates only that correction and does not invoke/substitute for `/closeout` or advance the package version.

## Canonical documents

Use `BOOT.md` as router and read the narrowest governing document.

```text
docs/contracts/project-contract.md
docs/contracts/mvp-scope-and-users.md
docs/contracts/domain-and-data-contract.md
docs/contracts/source-and-collection-contract.md
docs/contracts/article-lifecycle-and-deduplication.md
docs/contracts/public-feed-and-admin-contract.md
docs/contracts/testing-and-validation-contract.md
docs/architecture/system-architecture.md
docs/operations/security-reliability-and-operations.md
docs/roadmap/mvp-roadmap.md
docs/decisions/single-publication-simplified-data-model.md
docs/decisions/topic-independent-publication-model.md  # superseded historical ADR
docs/decisions/whitelist-and-structured-feed-first.md
docs/decisions/original-link-and-normalized-metadata.md
docs/decisions/cloudflare-access-admin-perimeter.md
```

`docs/README.md` indexes the structure and normative language.

If a task conflicts with a locked law in `docs/contracts/project-contract.md`, identify the conflict. Do not silently weaken the law, invent compatibility bridges, or treat existing code as higher authority.

## Locked project laws

1. The aggregation engine must never contain indie-author-specific business logic.
2. Every collected Article must originate from an administrator-approved Source.
3. RSS or other structured feeds are preferred over HTML scraping.
4. The original Article URL remains the primary public destination.
5. Source-specific data is normalized before public-feed use.
6. Repeated collection is idempotent and does not create duplicate Article records for one Source identity.
7. True duplicates are hidden behind one Primary Article while all Source instances/provenance remain stored.
8. Categories, Relevance rules, branding, and Sources belong to Publication configuration.
9. A failing Source must not interrupt unrelated collection.
10. Near-real-time means configurable polling unless a Source explicitly supports push delivery; push adapters are deferred beyond MVP unless promoted explicitly.
11. Each deployed installation hosts exactly one Publication/topic. Topic independence means reuse of the same shared codebase across separately configured deployments, not concurrent multi-Publication hosting. The deployment root `/` is the canonical public feed surface.

## Canonical domain law

Use terminology from `docs/contracts/domain-and-data-contract.md` plus the Accepted `docs/decisions/single-publication-simplified-data-model.md`.

High-risk distinctions:

- Publication is the singleton topic/editorial configuration boundary for one installation; it is not a relational tenant/ownership key.
- Do not preserve or introduce Publication UUIDs, slugs, foreign keys, joins, uniqueness scopes, repository parameters, authorization scopes, or compatibility aliases solely for hypothetical concurrent Publication hosting.
- A second unrelated topic is a second configured deployment of the same codebase, not another concurrently hosted Publication in one installation.
- Source is a configured publisher/outlet whose approval state determines trust; Source endpoint is the concrete feed/API/HTML location.
- Source `config_key` is installation-wide; endpoint `config_key` is Source-scoped.
- Approval/trust, configuration lifecycle, operational state, public visibility, moderation state, duplicate role, and derived health are separate.
- Active configuration may be enabled/paused/disabled; archived configuration is retired and not collectable.
- Collection run is one endpoint attempt and begins as persisted provenance with the first real fetch phase.
- Raw item is parser output; Article candidate is normalized but not yet accepted.
- Forward Article-candidate provenance is Source + endpoint + Collection run; redundant Publication identity is removed.
- Article is a persisted normalized Source instance; Article identity is Source-scoped.
- Article observation preserves Source/endpoint/run provenance without increasing Article cardinality.
- Article identity and true-duplicate identity are separate questions.
- Duplicate review/group state is installation-wide Article state and does not require Publication tenancy.
- Duplicate group contains separately stored true-duplicate Articles with exactly one Primary.
- Article visibility (`visible/hidden/archived`) is separate from duplicate role (`ungrouped/primary/non_primary`).
- Before Duplicate groups exist, persisted Articles are logically `ungrouped`; Phase 8 does not invent duplicate-group persistence.
- Ordinary feed eligibility requires singleton Publication `public_status = public`, an approved active Source, and a visible Article that is `ungrouped` or `primary` once grouping exists.
- Collection operational state is separate from public-row eligibility; pausing/failing collection does not by itself hide retained otherwise-eligible Articles.
- Public feed date uses parsed `published_at` when available and otherwise `first_seen_at`, with the fallback source detectable.
- The public headline destination is stored Article `original_url`; `canonical_identity_url` remains an identity field.
- Historical Phase 3–9 migrations/tasks/validation may describe Publication-scoped persistence/routes accurately; the post-Phase-9 correction supersedes that forward behavior without rewriting history.

## Collection law

Governed by `docs/contracts/source-and-collection-contract.md`, `docs/architecture/system-architecture.md`, and `docs/operations/security-reliability-and-operations.md`.

- Only approved, active, operationally enabled Sources/endpoints are collectable while singleton Publication `active_for_collection` is true.
- Operator-maintained bootstrap may explicitly create approved configuration but may not auto-discover/auto-approve, infer approval from fetch success, widen approved domains silently, or overwrite later operator-managed state.
- Forward bootstrap/runtime/Worker execution does not require a Publication slug/identifier to select among topics.
- Pre-fetch and every redirect hop pass approval + DNS/address/port/SSRF validation before network contact.
- Parsed Article links pass a separate post-normalization Source/domain policy gate.
- Source approved domains are the maximum boundary; endpoint policy may narrow, not silently widen.
- Structured-first order: RSS/Atom → stable API/feed → HTML extraction → custom adapter → browser fallback.
- Adapter interfaces are established with RSS/Atom and reused by later Source types.
- Parsers produce Raw items and never persist Articles directly.
- Normalization precedes Relevance, identity, duplicate, and feed behavior.
- Before configurable Relevance rules exist, the canonical Relevance boundary runs with an empty rule set and returns deterministic default `include`.
- Configurable MVP Relevance actions are include/exclude/categorize with installation-wide plus optional Source-scoped precedence; edits are prospective by default and automatic bulk historical reprocessing is deferred.
- Repeated Source observations converge transactionally on one Source-scoped Article identity.
- During Phases 5–9, collection was manually invoked through Worker endpoint runs; Web/API never fetches Sources inline.
- Phase 10 adds durable jobs/scheduling around the same endpoint execution unit; scheduler operates directly on due endpoints and uses the singleton collection-active state as a global gate.
- Endpoint runs/jobs fail independently and public-feed reads remain available.

## Article and duplicate law

Governed by `docs/contracts/article-lifecycle-and-deduplication.md`.

- Article identity prevents repeated polling from inserting the same Source instance and is resolved within Source.
- True duplicate grouping applies to separately stored Articles across Sources in the one installation.
- Fuzzy title alone never overwrites an Article.
- Weak duplicate evidence becomes a persisted review candidate.
- Dismissed unchanged review evidence must not recur indefinitely.
- Duplicate group has exactly one Primary.
- Changing Primary does not delete members or erase provenance.
- Hiding/restoring is independent from duplicate membership.
- Related coverage remains separate.
- When uncertain, preserve distinct visible reporting rather than suppress aggressively.

## Public/admin law

Governed by `docs/contracts/public-feed-and-admin-contract.md` and `docs/decisions/cloudflare-access-admin-perimeter.md`.

Forward basic public-feed baseline after the required post-Phase-9 correction:

- public readers require no authentication;
- singleton Publication configuration is used internally rather than selected by reader-supplied slug;
- canonical endpoint is `GET /api/feed`;
- absent/non-public singleton Publication states are indistinguishable as generic public `404` responses;
- a public Publication with no eligible Articles returns `200` with an empty list;
- results are a bounded server-defined recent window with deterministic effective-feed-date ordering;
- each basic item exposes stable Article identity, effective feed date/date source, display headline, Source display name, and stored `original_url` only as needed by the basic feed;
- Publication UUID/slug is not required as public response routing/scoping identity;
- safe dependency errors do not expose SQL, stack traces, credentials, or database detail;
- search/filters/client-controlled pagination and public presentation remain later phases.

Forward basic public-page baseline:

- canonical page is `GET /`;
- the page reuses the canonical public-feed read model/API semantics and MUST NOT introduce a parallel Article-eligibility, ordering, or database-query path;
- descriptive Publication name/branding comes from singleton configuration/read-model data rather than topic-specific shared UI constants;
- headlines link directly to the stored `original_url` supplied by that boundary;
- absent and non-public singleton Publication states use the same generic unavailable/not-found page state and do not reveal private configuration detail;
- loading, empty, dependency/error, direct-navigation, and refresh behavior are explicit;
- until Publication presentation timezone/settings exist, the basic UI renders calendar dates from `effectiveFeedDate` in UTC;
- desktop uses the core `Date | Headline | Source` view and mobile uses a sane stacked layout without pulling Phase 13 presentation polish forward;
- Web/API page handling does not collect Sources inline.

Historical Phase 8/9 validation artifacts continue to describe the slug-addressed API/page routes that were actually tested. They MUST NOT be rewritten to claim root-route evidence.

Admin MVP:

- admin navigation/configuration is for the installation's singleton Publication and does not provide a topic switcher;
- Cloudflare Access is the external access perimeter;
- supported deployments prevent direct-origin admin bypass;
- state-changing browser actions use CSRF/equivalent request-integrity controls;
- application commands validate real Source/endpoint/run/Article/observation/duplicate relationships and domain invariants, not obsolete Publication tenancy;
- native application accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP.

Before the full Publication-admin phase exists, the smallest explicit topic-independent operator mechanism may change singleton `public_status`. Ordinary bootstrap remains create-if-absent and does not overwrite existing persisted state.

## Validation law

Governed by `docs/contracts/testing-and-validation-contract.md`.

- Automated behavioral regression coverage is the primary protection against implementation regressions.
- Every implementation change requires focused tests for the changed behavior plus relevant broader regression coverage for its blast radius.
- Test evidence applies to the exact final source tree that was executed; earlier passing evidence does not automatically validate later changes.
- Source inspection is not runtime proof, HTTP integration is not browser proof, fixture collection is not live-Source proof, and mocks do not prove PostgreSQL transactions/constraints/locks/migrations.
- Persistence/migration guarantees use real disposable PostgreSQL where practical from Phase 2 onward.
- Ordinary deterministic local regression validation must not depend on live public publishers; deterministic collection uses controlled fixtures/servers without weakening production SSRF or whitelist policy.
- Explicitly invoked required suites fail clearly when prerequisites are missing and must not silently skip green.
- Zero matched tests in a required filtered suite is a failure.
- Flaky/skipped tests do not satisfy exit gates for the behavior they would have proved.
- Every reproducible defect should receive regression coverage when technically practical.
- Every implementation roadmap phase and gating correction inherits the testing contract.
- Historical Phase 9 evidence remains historical; the singleton correction must create new migration/regression/browser evidence for its corrected tree.
- The singleton correction specifically requires migration-from-zero, migration of representative populated one-Publication state, rejection of ambiguous multi-Publication state, Source-scoped identity/integrity, unchanged collection safety/accounting, `/api/feed`, `/`, and Level 6 browser coverage before Phase 10 implementation proceeds.
- The gating correction closeout requires executed local terminal evidence and a durable `docs/validation/` artifact tied to the exact accepted corrected source tree.

## Roadmap law

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 10 — Automated polling, durable jobs, and endpoint health**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend implementation/validation are complete with durable validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026. Its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in the recorded run because The Creative Penn timed out under the recorded execution environment; owner acceptance advances roadmap state without rewriting that evidence.

Phase 10 is active, but implementation is gated on the owner-approved **single-Publication simplification correction**: flatten obsolete Publication tenancy, preserve genuine Source/endpoint/run/Article/observation integrity, remove Publication selectors from supported runtime paths, make `/api/feed` and `/` canonical, and validate migration/regression/browser behavior. This gate is not a new numbered roadmap phase and must execute as a non-versioned correction stack before ordinary Phase 10 prompts begin.

Phases 1–9 remain the tech-demo critical path historically; do not pull later admin/discovery/deduplication work into the correction or Phase 10 without a true dependency or explicit decision.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests and name the evidence level needed to prove acceptance.
- Do not claim runtime/browser/database/live-Source behavior unless actually observed at the corresponding evidence level.
- Prefer smallest correct changes over speculative abstractions or compatibility bridges.
- Trace shared helpers/consumers before changing data or collection semantics.
- Before singleton-correction work trace migrations/schema → Publication/bootstrap repositories → Sources/endpoints → Worker/manual selection → candidate provenance → Article identity/observations → public-feed repository/routes/page → fixtures/tests/browser evidence.
- Before public-route work trace singleton Publication settings → canonical read model → `/api/feed` → `/` page/client → unavailable/error behavior → external links → browser tests.
- Confirm applicable local validation commands/suites were actually executed against the final tree before approval.
- Confirm each Codex roadmap phase prompt uses its assigned one-based prompt number/version; confirm each correction prompt preserves its declared unchanged version; `package.json` remains authoritative in both modes.
- Before declaring a task folder automation-ready, validate its exact machine-parsed grammar against the current runner; do not infer parser compatibility from visual similarity to historical prompts.
- Every roadmap or correction implementation/closeout prompt follows the `BOOT.md` quality-first model/reasoning/usage policy: record the exact recommended current Codex configuration, complexity/quality floor, estimated usage, relevant alternative, and efficiency rationale. Complexity/correctness/security/data-integrity risk sets the floor first; token/credit efficiency may optimize only among configurations that still satisfy that floor.
- Make a concrete recommendation when asked for the recommended option.
- Never invent repository state, test results, Source behavior, or history.

## Pre-production compatibility rule

Use one canonical design. Do not add old/new aliases, synchronized duplicate fields, fallback compatibility paths, dormant Publication tenant fields, or speculative migration bridges unless a task explicitly requires a one-time migration. In particular, do not preserve slug-addressed public/runtime routing or Publication-scoped repository APIs solely because they existed before the singleton correction.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
