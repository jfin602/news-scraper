# News Scraper Boot Document

This file is the session initialization contract for repository-aware work. Read it first in a new ChatGPT/Codex session involving `jfin602/news-scraper`.

It establishes project identity, terminology, authority, document routing, workflow gates, shorthand commands, and repository safety rails. It is a router/interpreter, not a replacement for specialized contracts, ADRs, implementation docs, or tests.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Repository/product working name: News Scraper
- Platform definition: reusable, topic-independent news aggregation Platform
- Current phase: Phase 0 — Contracts and product foundation
- Production status: pre-production
- Initial Publication: publishing-industry news relevant to indie authors
- Public direction: rolling recent-headline feed sending readers to original publishers
- Admin direction: Publication/Source/endpoint/relevance/Category/Article/duplicate/health/audit control plane
- Core constraint: Publication-specific behavior is configuration; shared engine logic is topic independent

## New-session startup

For project-wide planning/implementation, refresh:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/roadmap/mvp-roadmap.md`
6. the narrowest governing contract/ADR
7. relevant implementation/tests
8. recent commits affecting the area when recency matters

Do not read every document indiscriminately. Use routing below. A full `/docs-review` is the intentional exception.

## Canonical terminology

Terminology is governed by `docs/contracts/domain-and-data-contract.md`.

- `repo` / `source code` = `jfin602/news-scraper`
- `Platform` = reusable aggregation software
- `Publication` = configured news product and topic-specific boundary
- `Source` = administrator-approved publisher/outlet
- `Source endpoint` = concrete feed/API/HTML location
- `Collection run` = one attempt to collect one endpoint
- `Raw item` = minimally interpreted parser output
- `Article candidate` = normalized but not yet accepted
- `Article` = persisted normalized Source instance
- `Article observation` = endpoint/run provenance for an Article/candidate outcome
- `Duplicate review candidate` = persisted possible duplicate decision/review record
- `Duplicate group` = separately stored Articles representing the same underlying published item
- `Primary article` = one member selected to represent a Duplicate group publicly
- `Related coverage` = distinct reporting about the same subject/event; not a true duplicate
- `Category` = Publication-owned editorial grouping
- `Relevance rule` = deterministic Publication-owned include/exclude/categorize rule
- `contract` = behavior implementation must preserve
- `ADR` = decision record in `docs/decisions/`
- `task` = implementation prompt under `docs/tasks/`
- `refresh` = re-read current repository sources before answering
- `lock` = treat a decision as authoritative and identify documents that must reflect it

Do not blur Source vs endpoint, Article identity vs duplicate identity, operational state vs health, or Article visibility vs duplicate role.

## Authority and conflict handling

Canonical authority is defined by `docs/contracts/project-contract.md`:

1. locked laws;
2. explicit project-contract invariants;
3. domain/lifecycle contracts;
4. architecture/interface/security contracts and Accepted ADRs;
5. roadmap/implementation notes;
6. root summaries/routing (`AGENTS.md`, `README.md`, `BOOT.md`);
7. implementation;
8. historical task prompts;
9. comments/commit messages/stale notes.

A current user instruction controls task scope. If it proposes changing a locked law, treat it as a contract-change request.

Never silently choose between conflicting authoritative sources. Report the conflict and recommended correction.

## Document routing

| Area | Read first |
|---|---|
| Locked laws / authority / product boundaries | `docs/contracts/project-contract.md` |
| MVP users / capabilities / exclusions | `docs/contracts/mvp-scope-and-users.md` |
| Terminology / ownership / states / entities / identity / provenance | `docs/contracts/domain-and-data-contract.md` |
| Process/module architecture / pipeline / scheduling / transactions | `docs/architecture/system-architecture.md` |
| Approval / polling / fetch / parser / normalization / relevance / identity / run accounting | `docs/contracts/source-and-collection-contract.md` |
| Article visibility / duplicate role / review/grouping / Primary | `docs/contracts/article-lifecycle-and-deduplication.md` |
| Public feed / search / themes / admin UX | `docs/contracts/public-feed-and-admin-contract.md` |
| Auth / SSRF / content safety / failure isolation / observability / recovery | `docs/operations/security-reliability-and-operations.md` |
| Phase sequence / exit gates | `docs/roadmap/mvp-roadmap.md` |
| Topic-independent decision | `docs/decisions/topic-independent-publication-model.md` |
| Whitelist/structured-feed decision | `docs/decisions/whitelist-and-structured-feed-first.md` |
| Original-link/normalization decision | `docs/decisions/original-link-and-normalized-metadata.md` |
| Documentation index | `docs/README.md` |
| Implementation prompts | `docs/tasks/` when present |
| Durable validation artifacts | `docs/validation/` when present |

If a referenced path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared engine code remains topic independent.
- Only approved+operationally enabled Sources/endpoints under a collection-active Publication are contacted.
- Approval/trust state, operational state, public status, moderation state, duplicate role, and health are separate.
- Every request/redirect passes pre-fetch network-safety validation before contact.
- Parsed Article links pass separate post-normalization Source/domain validation.
- Parser output never persists Articles directly.
- Source-shaped data is normalized before relevance, identity, duplicate, or public-feed use.
- MVP Relevance rules are deterministic include/exclude/categorize; generic boost/ranking is deferred.
- Article identity is transactionally idempotent.
- Article observations preserve endpoint/run provenance.
- True-duplicate grouping applies to separately stored Articles.
- Article visibility is independent from duplicate role.
- Ordinary feed eligibility = visible + (`ungrouped` or `primary`).
- Weak duplicate evidence persists as review state rather than causing silent suppression.
- Dismissed unchanged duplicate evidence does not recur indefinitely.
- Source failures/jobs are isolated and public feed remains readable during collection failures.
- Push/webhook adapters and pinning/featured ordering are deferred beyond MVP unless explicitly promoted.

## Current roadmap state

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 0 — Contracts and product foundation**.

Phase 0 exit gate requires no unresolved documentation contradiction and explicit measurable contracts. Do not advance by assumption; evaluate the gate after documentation alignment.

Future order:

1. Phase 1 — Repository/application foundation
2. Phase 2 — Authentication, Publication, Source administration
3. Phase 3 — RSS/Atom collection/normalization vertical slice
4. Phase 4 — Article identity/persistence/relevance/public feed
5. Phase 5 — True duplicate detection/moderation
6. Phase 6 — Configurable HTML collection
7. Phase 7 — Reliability/observability/production hardening
8. Phase 8 — Customer launch validation

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- State exact allowed files when knowable.
- Include non-goals/preserved behavior.
- Require focused tests plus broader regression coverage.
- Do not claim runtime/browser behavior unless actually observed.
- Separate confirmed facts, inference, recommendations, unresolved questions.
- Prefer smallest correct incremental change.
- Trace shared helpers/consumers before changing them.
- Before collection changes trace approval → operational state → scheduler → lock → safety → fetch/redirect → parse → normalize → Article-link validation → relevance → identity → observation → duplicate → run accounting → health → tests.
- Before Article/duplicate changes trace external IDs/canonical URLs/uniqueness → observations → review candidates → groups → Primary → moderation → feed → tests.
- Make a concrete choice when asked for `recommended`.
- Never invent repository state, tests, browser results, Source behavior, or history.

# Conversation commands

Commands are conversational shorthand, not shell commands.

## Context commands

### `/boot`
Refresh BOOT, root summaries, project contract, roadmap, and narrow governing docs.

### `/refresh <area>`
Re-read relevant source/docs/tests/recent commits.

### `/state`
Summarize implementation state, active phase, completed work, constraints, next logical work.

### `/route <topic>`
Identify governing contracts/ADRs/source/tests/tasks.

## Analysis commands

### `/audit <area>`
Compare contracts, ADRs, source, tests, recent changes, and observable behavior; report disagreements/risks.

### `/contract-check <area>`
Check implementation/tests against governing contracts and locked laws.

### `/doc-check <area>`
Narrow documentation consistency check. Does not replace full `/docs-review`.

### `/source-trace <source or behavior>`
Trace Publication → Source → endpoint → approval/state → safety → schedule/fetch → parse/normalize → link validation → relevance → identity/observation → duplicate → persistence → run/health → consumers/tests.

### `/article-trace <field or concept>`
Trace Raw item → candidate → Article identity/persistence → observations → overrides → duplicate role → feed/admin/tests.

### `/dedupe-trace <case>`
Trace Article identity separately from true-duplicate evidence, review state, groups, Primary selection, false-positive safeguards, moderation, feed effects/tests.

### `/blast-radius <change>`
Identify affected contracts, ADRs, schemas/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`
Trace suspected regression to likely change, affected invariants, missing protection.

# Documentation workflow

## `/docs-review`

Always a **read-only first pass**.

Default full documentation scope: every tracked `.md` and `.txt` except:

- `docs/tasks/`
- `docs/validation/`

A conversation may narrow scope explicitly.

Return:

- interpreted scope;
- reviewed/excluded docs;
- contradictions;
- source/documentation drift when applicable;
- stale/obsolete statements;
- duplicated/misplaced/unclear authority;
- missing docs/cross-references;
- organization/routing problems;
- recommended changes by file;
- recommended application order.

Do not modify files during `/docs-review`.

## `/docs-apply`

Apply only approved findings/change groups from the current conversation.

Before editing, re-read targets and confirm repository drift has not invalidated findings. If it has, report rather than applying stale advice.

`/docs-apply` is explicit authorization to commit the approved **documentation-only** changes directly to `main` under this repository workflow unless the user requests a branch/PR. It is not authorization for source-code changes, unrelated cleanup, history rewriting, or unapproved documentation edits.

After applying, report changed files, addressed findings, unapplied findings/reasons, newly discovered conflicts, and remaining validation.

# Prompt workflow

Strict order:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Do not silently run missing earlier stages.

When unstable requirements, contradictory docs, repository drift, or a material decision blocks advancement, return a clearly labeled `Planning needed` section and stop before the next stage.

## `/prompt-ass`

Determine safe implementation-task boundaries from established behavior/contracts/roadmap. No repository writes.

Return target behavior, confirmed constraints, roadmap phase, recommended prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior for each prompt, and closeout prompt when needed.

Prefer the smallest number of independently implementable/reviewable/regression-safe prompts.

## `/prompt-plan`

Requires completed `/prompt-ass` in current conversation.

Perform source-level planning for every assessed prompt: inspect contracts/ADRs, implementation, schemas/migrations, process roles, relevant modules/helpers/consumers/tests/recent changes; define exact likely file scope, preserved behavior, risks, tests, runtime/browser validation, documentation implications, acceptance criteria, and non-goals.

May revise prompt boundaries when source evidence requires it; material revisions produce `Planning needed` before writing.

No repository writes.

## `/prompt-write <folder name>`

Requires completed, unblocked `/prompt-plan`. Write one ordered `.txt` per approved prompt under:

```text
docs/tasks/<folder name>/
```

Before writing, revalidate BOOT, project contract, roadmap, governing docs, relied-upon source, recent drift, and destination paths. Do not overwrite existing task files without explicit authorization.

Default filenames when no convention exists:

```text
P0-<short-task-slug>.txt
P1-<short-task-slug>.txt
P2-<short-task-slug>.txt
```

## Supporting prompt commands

- `/prompt <task>` — one implementation-ready prompt in conversation only.
- `/stack <goal>` — legacy shorthand for `/prompt-ass`.
- `/split <task>` — narrow prompt-assessment shorthand.
- `/revalidate <task or stack>` — compare existing task(s) to current repo/contracts.
- `/closeout <task>` — assess final regression/docs/runtime validation prompt.

# Review and validation commands

- `/review <commit, PR, task, implementation>` — review against prompt/contracts/laws/tests/consumers/security/provenance/failure isolation.
- `/prove <behavior>` — define/perform validation required to prove behavior.
- `/test-matrix <feature>` — build input/state/persistence/idempotency/failure/security matrix.
- `/collector-check <source or collector>` — validate approval/state, SSRF, fetch/redirect, parse/normalize, retry/isolation, run accounting/outcomes.
- `/dedupe-check <rule or case>` — validate identity, review candidate, grouping, Primary, provenance, false positives, moderation, feed output.

# Decision commands

### `/lock <decision>`
Treat decision as authoritative direction and identify affected contract/ADR/root/task docs. Do not modify files unless instructed. Locked-law amendments follow project-contract change process.

### `/recommend`
Choose the best option using contracts, architecture, roadmap, user value, security/reliability, and implementation risk.

### `/status`
Return only: Completed / Current / Blocked / Next.

### `/next`
Recommend the single most logical next task.

# Command modifiers

- `--deep` extended source/docs/test/history analysis
- `--quick` focused answer
- `--docs-only`
- `--code-only`
- `--no-write`
- `--prompt-only`
- `--file-scoped`
- `--regression-safe`
- `--latest`
- `--browser`
- `--db`
- `--tests`
- `--contracts`
- `--sources`
- `--dedupe`
- `--security`
- `--reassess`

# Codex prompt requirements

A finished implementation prompt normally includes:

- Task / Context
- Current / Required behavior
- Roadmap phase
- Governing contracts/ADRs + affected locked laws
- Source files inspected
- Files allowed to change / must not change
- Implementation constraints / preserved behavior
- Security, provenance, idempotency, failure-isolation implications where applicable
- Regression risks
- Focused + broader tests
- Runtime/browser validation where applicable
- Documentation updates
- Acceptance criteria
- Explicit non-goals

Collection prompts preserve approval/state boundaries, pre-request network safety, run isolation, bounded retry, and Source-domain policy.

Persistence/identity prompts address transactional idempotency + Article observations.

Duplicate prompts preserve all Article instances/observations, exactly one Primary/group, review-state persistence, false-positive safeguards, and manual reversibility.

Publication/relevance prompts preserve topic independence.

Public-feed prompts preserve original-publisher destination and visible ungrouped-or-Primary eligibility.

# Repository modification rules

- Do not modify/commit unless explicitly authorized by the current command/request.
- `/docs-review` never writes.
- `/docs-apply` may write only approved documentation findings; by invoking it the user authorizes those documentation-only changes on `main` unless they request a branch/PR.
- `/prompt-ass` and `/prompt-plan` never write.
- `/prompt-write` writes only approved task files in the established task folder.
- No task files while `Planning needed` remains unresolved.
- No speculative migrations or compatibility bridges.
- No topic conditionals in shared engine code.
- No Source/endpoint approval bypass or silent whitelist expansion.
- No parser-to-Article direct persistence.
- No deletion of Article/observation provenance merely because duplicate suppression exists.
- No weakening idempotency/duplicate/security boundaries to make tests pass.
- Search all references before renames.
- Do not report tests/runtime/browser behavior as verified unless actually observed.
- Do not create PRs, merge, force-update history, or perform non-document branch/history changes unless explicitly instructed.
- Preserve smallest viable diff for scoped fixes.

# Pre-production compatibility rule

Prefer one canonical design. Do not add old/new aliases, synchronized duplicate fields, fallback compatibility paths, or speculative migration compatibility unless explicitly required.

# Boot document maintenance

Update BOOT when phase, core document path, terminology, commands, authority, locked laws, modification conventions, branch, or repository identity change.

Detailed feature specifications belong in specialized contracts/ADRs, not BOOT.

When BOOT conflicts with a higher-authority contract, the contract wins and BOOT must be corrected.
