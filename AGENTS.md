# AGENTS.md

## Project Name

News Scraper

## Project Goal

Build a reusable, topic-independent news aggregation Platform that collects Article metadata only from administrator-approved Sources, normalizes Source-specific input, persists Articles idempotently with endpoint/run provenance, suppresses true duplicates without destroying Source instances, and serves a rolling feed whose headlines link to original publishers.

Each deployed installation hosts exactly one Publication/topic. The first configured deployment is publishing-industry news relevant to indie authors. That topic is singleton Publication configuration, not aggregation-engine identity. A different topic reuses the same codebase through a separately configured deployment rather than being added as another live Publication in the same installation.

The canonical customer-visible feed is the deployment root `/` and the canonical basic feed API is `/api/feed`. Publication is not a relational tenancy key; do not introduce Publication IDs/slugs/FK scopes merely for hypothetical concurrent hosting.

## Documentation Workflow

Follow `BOOT.md`.

- `/closeout` is the phase-handoff command after a roadmap phase has formally closed. It performs a quick closeout/evidence check and, only when green, advances `package.json` to `0.<next phase>.0`.
- A correction stack may also contain a final manual closeout prompt, but that correction closeout is not `/closeout`; it clears only the correction/gate and preserves the active roadmap phase/package version.
- `/docs-review` is always a read-only first pass.
- Do not modify documentation during review/cleanup/alignment until findings are approved and either `/docs-apply` is invoked or a generated docs snapshot is used with `/docs-prompt` to emit one docs-only Codex prompt.
- `/docs-apply` authorizes only approved documentation changes and may commit them directly to `main` unless the user requests otherwise.
- `/docs-prompt` is the read-only alternative after approval: run `npm run docs:snapshot`, provide `news-scraper-docs-context.zip`, then use `/docs-prompt` to produce one prompt for Codex to apply locally. `BOOT.md` defines its full contract.
- Preserve unrelated wording during scoped documentation fixes.
- Normal phase handoff follows `/closeout` → `/docs-review` → `/docs-apply` → `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.
- Parallel UI work is governed by `docs/design/ui-workflow.md` on the permanent `ui-polish` branch/worktree. The normal targeted path is `/ui-plan` → `/ui-write`; when durable design guidance must first change, `/ui-plan` requires `/ui-review` → explicit approval → `/ui-apply` → rerun `/ui-plan` before `/ui-write`.

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
- The completed Phase 10 entry singleton implementation correction was the first non-versioned correction stack and did not consume Phase 10 patch numbers.
- Parallel UI work is also non-versioned and does not consume roadmap prompt numbers or change roadmap/correction state.

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

Targeted UI prompts under `docs/design/tasks/` are not a third `codex:phase` grammar. They follow `docs/design/ui-workflow.md`, are single targeted prompts, require `Workstream: UI` and execution on `ui-polish`, and must preserve project version and roadmap state.

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
docs/design/README.md
docs/design/ui-workflow.md
docs/decisions/single-publication-simplified-data-model.md
docs/decisions/topic-independent-publication-model.md  # historical superseded ADR
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
- Do not introduce Publication UUIDs, slugs, foreign keys, joins, uniqueness scopes, repository parameters, authorization scopes, or compatibility aliases solely for hypothetical concurrent Publication hosting.
- A second unrelated topic is a second configured deployment of the same codebase, not another concurrently hosted Publication in one installation.
- Source is a configured publisher/outlet whose approval state determines trust; Source endpoint is the concrete feed/API/HTML location.
- Source `config_key` is installation-wide; endpoint `config_key` is Source-scoped.
- Categories and Relevance rules use immutable installation-wide `config_key` identities; a Relevance rule may optionally be Source-scoped.
- Approval/trust, configuration lifecycle, operational state, public visibility, moderation state, duplicate role, and derived health are separate.
- Active configuration may be enabled/paused/disabled; archived configuration is retired and not collectable.
- Collection run is one endpoint attempt and begins as persisted provenance with the first real fetch phase.
- Raw item is parser output; Article candidate is normalized but not yet accepted.
- Article-candidate provenance is Source + endpoint + Collection run; Publication tenancy is not part of candidate identity/provenance.
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
- Before production compatibility is established, databases are created fresh from the smallest current canonical migration chain; old pre-production database contents are disposable, and legacy-only migration/code/API/type/test/fixture/configuration artifacts are not retained merely as an upgrade/history surface.

## Collection law

Governed by `docs/contracts/source-and-collection-contract.md`, `docs/architecture/system-architecture.md`, and `docs/operations/security-reliability-and-operations.md`.

- Only approved, active, operationally enabled Sources/endpoints are collectable while singleton Publication `active_for_collection` is true.
- Operator-maintained bootstrap may explicitly create approved configuration but may not auto-discover/auto-approve, infer approval from fetch success, widen approved domains silently, or overwrite later operator-managed state.
- Bootstrap/runtime/Worker execution does not require a Publication slug/identifier to select among topics.
- Pre-fetch and every redirect hop pass approval + DNS/address/port/SSRF validation before network contact.
- Parsed Article links pass a separate post-normalization Source/domain policy gate.
- Source approved domains are the maximum boundary; endpoint policy may narrow, not silently widen.
- Structured-first order: RSS/Atom → stable API/feed → HTML extraction → custom adapter → browser fallback.
- Adapter interfaces are established with RSS/Atom and reused by later Source types.
- Parsers produce Raw items and never persist Articles directly.
- An optional Source-owned RSS/Atom item admission filter uses one or more bounded non-empty include phrases with deterministic case-insensitive literal any-match semantics over existing parsed title, summary/content, and Source-provided category labels. No configured phrases preserves collect-all behavior. Filter mismatches terminate before normalization and are not Relevance `excluded` outcomes or Article observations.
- Normalization precedes Relevance, identity, duplicate, and feed behavior.
- Before configurable Relevance rules exist, the canonical Relevance boundary runs with an empty rule set and returns deterministic default `include`.
- Phase 11 MVP Relevance predicates are only literal `title_contains`, `summary_contains`, and `source_category_equals`. Missing fields do not match; regex/glob/fuzzy/semantic/general expression behavior is not implied.
- Matching include/exclude precedence is priority descending → Source-scoped before installation-wide → `exclude` before `include` → immutable rule `config_key` ascending for the final stable reason tie-break; otherwise inclusion defaults to `include`.
- All matching categorize rules apply and are deduplicated by Category `config_key`; categorize priority orders reasons but does not suppress another matching Category. Endpoint default Category then Source default Category are fallback-only when no categorize rule assigns a Category.
- A Relevance exclusion terminates before Article identity, persists the canonical `excluded` outcome with endpoint/run provenance and reason, and does not retroactively mutate an earlier persisted Article.
- Configurable MVP Relevance edits are prospective by default and automatic bulk historical reprocessing is deferred.
- Before the Phase 15 admin surface, the smallest explicit topic-independent operator mechanism may create/edit Category/Relevance/default-Category configuration, but it is never applied implicitly at Web/Worker startup and must not weaken ordinary bootstrap no-overwrite behavior.
- Repeated Source observations converge transactionally on one Source-scoped Article identity.
- During Phases 5–9, collection was manually invoked through Worker endpoint runs; Web/API never fetched Sources inline.
- Phase 10 added durable jobs/scheduling around the same endpoint execution unit; scheduler operates directly on due endpoints and uses the singleton collection-active state as a global gate.
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

Basic public-feed baseline:

- public readers require no authentication;
- singleton Publication configuration is used internally rather than selected by reader-supplied slug;
- canonical endpoint is `GET /api/feed`;
- absent/non-public singleton Publication states are indistinguishable as generic public `404` responses;
- a public Publication with no eligible Articles returns `200` with an empty list;
- results are a bounded server-defined recent window with deterministic effective-feed-date ordering;
- each basic item exposes stable Article identity, effective feed date/date source, display headline, Source display name, and stored `original_url` only as needed by the basic feed;
- Publication UUID/slug is not required as public response routing/scoping identity;
- safe dependency errors do not expose SQL, stack traces, credentials, or database detail.

Phase 12 discovery extends that same canonical endpoint/read model:

- optional `q`, `source`, `category`, and `cursor` inputs are bounded and validated;
- `source` and `category` use immutable public `config_key` identities rather than database UUIDs or mutable labels;
- at most one Source and one Category filter apply in MVP, and supplied discovery dimensions compose with AND semantics;
- Category filtering uses current `article_categories` membership rather than historical observation reasons;
- keyword search is bounded case-insensitive literal matching over the display/normalized headline and other explicitly exposed safe normalized textual metadata; regex, fuzzy, semantic, and ranking behavior are not implied;
- search/filtering never changes canonical chronological ordering;
- pagination uses opaque/versioned keyset cursors derived from effective feed date, `first_seen_at`, and stable Article identifier and bound to normalized discovery criteria;
- page size remains bounded and server-defined in Phase 12;
- malformed/unsupported discovery input returns bounded generic `400` behavior without changing existing public `404`/dependency semantics;
- the response exposes only bounded public Source/Category option identity/label data needed by the discovery UI and a nullable next cursor.

Basic public-page baseline:

- canonical page is `GET /`;
- the page reuses the canonical public-feed read model/API semantics and MUST NOT introduce a parallel Article-eligibility, ordering, or database-query path;
- descriptive Publication name/branding comes from singleton configuration/read-model data rather than topic-specific shared UI constants;
- headlines link directly to the stored `original_url` supplied by that boundary;
- absent and non-public singleton Publication states use the same generic unavailable/not-found page state and do not reveal private configuration detail;
- loading, empty, dependency/error, direct-navigation, and refresh behavior are explicit;
- until Publication presentation timezone/settings exist, the basic UI renders calendar dates from `effectiveFeedDate` in UTC;
- desktop uses the core `Date | Headline | Source` view and mobile uses a sane stacked layout without pulling Phase 13 presentation polish forward;
- Web/API page handling does not collect Sources inline.

Phase 12 page behavior reflects `q`, `source`, and `category` in the URL; changing those inputs resets pagination, Reset clears discovery state, browser back/forward restores URL discovery state, and load-more cursor depth does not need to become canonical shareable URL state.

Accepted Phase 8/9 validation artifacts continue to describe the slug-addressed routes actually tested at their source SHAs; the completed singleton correction supplies current selector-free route evidence.

Admin MVP:

- admin navigation/configuration is for the installation's singleton Publication and does not provide a topic switcher;
- Cloudflare Access is the external access perimeter;
- supported deployments prevent direct-origin admin bypass;
- state-changing browser actions use CSRF/equivalent request-integrity controls;
- application commands validate real Source/endpoint/run/Article/observation/duplicate relationships and domain invariants, not Publication tenancy;
- native application accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP.

Before the full Publication-admin phase exists, the smallest explicit topic-independent operator mechanisms may change already-governed mutable singleton/editorial configuration without turning ordinary bootstrap into overwrite authority.

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
- Phase 9's accepted validation artifact remains historical evidence for its exact source tree.
- The Phase 10 entry singleton correction is complete and its durable validation artifact remains authoritative for the corrected singleton migration/identity/collection/public-browser evidence actually observed.
- Phase 10 is complete with durable scheduler/job/retry/overlap/recovery validation evidence.
- Phase 11 is complete with durable deterministic literal-predicate/precedence/category/default/prospective/excluded-accounting and real-PostgreSQL Category/rule persistence evidence.
- Phase 12 is complete with durable API/database/browser discovery evidence.
- Phase 13 is complete with durable persistence/read-model, responsive presentation, branding, theme, accessibility, loading-state, browser, and Phase 12 regression evidence.
- Phase 14 requires focused Source-admin API/database/browser evidence plus deterministic Source RSS/Atom item-admission matching, pipeline/accounting, prospective behavior, and collection-fixture evidence.

## Roadmap law

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 14 — Source administration**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend implementation/validation are complete with durable validation. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026 with its recorded live-source limitation preserved. The Phase 10 entry singleton correction, Phase 10 Automated polling/durable jobs/endpoint health, Phase 11 Categories/configurable Relevance execution, Phase 12 Feed discovery features, and Phase 13 Public presentation polish are complete with durable validation.

Phase 14 is active. It owns Source administration and the optional Source RSS/Atom item admission filter. Do not pull Phase 15 Publication/Relevance administration, Phase 16 duplicate grouping, or later work into Phase 14 unless a true dependency or explicit decision requires it.

Phases 1–9 remain the tech-demo critical path historically.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests and name the evidence level needed to prove acceptance.
- Do not claim runtime/browser/database/live-Source behavior unless actually observed at the corresponding evidence level.
- Prefer smallest correct changes over speculative abstractions or compatibility bridges.
- Trace shared helpers/consumers before changing data or collection semantics.
- Before Phase 14 work trace Cloudflare Access/origin protection → request integrity → Source/endpoint configuration and lifecycle → Source-owned RSS/Atom admission phrases → real resource relationships/domain invariants → canonical job/manual execution → collection pipeline/accounting/health → admin API/UI → integration/database/fixture/browser tests.
- Before public-route work trace singleton Publication settings → canonical read model → `/api/feed` → `/` page/client → unavailable/error behavior → external links → browser tests.
- Before UI work read `docs/design/README.md` and `docs/design/ui-workflow.md`, trace presentation source/shared frontend consumers/tests, and keep concurrent UI implementation isolated in the `ui-polish` worktree.
- Confirm applicable local validation commands/suites were actually executed against the final tree before approval.
- Confirm each Codex roadmap phase prompt uses its assigned one-based prompt number/version; confirm each correction prompt preserves its declared unchanged version; `package.json` remains authoritative in both modes.
- Before declaring a task folder automation-ready, validate its exact machine-parsed grammar against the current runner; do not infer parser compatibility from visual similarity to historical prompts.
- Every roadmap or correction implementation/closeout prompt follows the `BOOT.md` minimum-adequate usage-conservation policy: start from the lowest expected-credit current configuration that plausibly satisfies the correctness floor, escalate only for a concrete task-specific reason, and record the recommendation, complexity/quality floor, estimated usage, lower-cost alternative, escalation trigger, and efficiency rationale. Prompt length, phase number, broad validation volume, or feature importance alone do not justify a more expensive model.
- Make a concrete recommendation when asked for the recommended option.
- Never invent repository state, test results, Source behavior, or history.

## Pre-production compatibility rule

Use one canonical design. Do not add old/new aliases, synchronized duplicate fields, fallback compatibility paths, dormant Publication tenant fields, or speculative migration bridges. Before production database compatibility is established, databases from older source trees are disposable and the active migration/runtime/test/config tree MUST be reduced to the smallest current canonical system. Delete/squash/replace legacy-only migrations, compatibility wrappers/APIs/types, obsolete tests/fixtures, slug-addressed public/runtime routing, Publication-scoped repository APIs, and obsolete configuration paths when they have no independent current purpose. Historical detail belongs in Git history, superseded ADRs, historical prompts, and validation artifacts instead of active compatibility machinery.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
