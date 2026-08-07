# News Scraper Boot Document

This is the session initialization contract for repository-aware work in `jfin602/news-scraper`. Read it first in a new ChatGPT/Codex session.

It establishes project identity, canonical terminology, authority, document routing, workflow gates, shorthand commands, and repository safety rails. It is a router/interpreter, not a substitute for specialized contracts, ADRs, implementation docs, or tests.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Working product/repository name: News Scraper
- Platform: reusable, topic-independent news aggregation Platform
- Current phase: **Phase 1 — Application foundation**
- Production status: pre-production
- Initial Publication: publishing-industry news relevant to indie authors
- Public direction: rolling recent-headline feed sending readers to original publishers
- Admin direction: Cloudflare Access-protected Publication/Source/endpoint/Relevance/Category/Article/duplicate/health/change-history control plane, built after the tech-demo vertical slice
- Core constraint: Publication-specific behavior is configuration; shared engine logic remains topic independent

Phase 0 final documentation alignment is complete. The repository is ready for Phase 1 implementation planning.

## Delivery priority

Phases 1–9 are the tech-demo critical path.

The first demonstrable milestone is: at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public feed with original-publisher headline links.

Do not front-load admin convenience, native authentication, feed discovery polish, duplicate moderation, or HTML collection into that critical path unless a true dependency is demonstrated.

## New-session startup

For project-wide work refresh:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/contracts/project-contract.md`
5. `docs/roadmap/mvp-roadmap.md`
6. narrowest governing contract/ADR
7. relevant implementation/tests
8. recent commits affecting the area when recency matters

Do not read every document indiscriminately. Use routing below. A full `/docs-review` is the intentional exception.

## Canonical terminology

Governed by `docs/contracts/domain-and-data-contract.md`.

- `repo` / `source code` = `jfin602/news-scraper`
- `Platform` = reusable aggregation software
- `Publication` = configured news product and topic-specific boundary
- `Source` = configured publisher/outlet; approval state determines whether it is trusted for collection
- `Source endpoint` = configured feed/API/HTML location owned by a Source
- `Collection run` = one attempt to collect one endpoint; persisted provenance begins with the first real fetch phase
- `Raw item` = minimally interpreted parser output
- `Article candidate` = normalized but not yet accepted
- `Article` = persisted normalized Source instance
- `Article observation` = endpoint/run provenance for an Article/candidate outcome
- `Duplicate review candidate` = persisted possible true-duplicate decision/review record
- `Duplicate group` = separately stored Articles representing the same underlying published item
- `Primary article` = one member selected to represent a Duplicate group publicly
- `Related coverage` = distinct reporting about same subject/event; not a true duplicate
- `Category` = Publication-owned editorial grouping
- `Relevance rule` = deterministic Publication-owned include/exclude/categorize rule
- `contract` = behavior implementation must preserve
- `ADR` = decision record in `docs/decisions/`
- `task` = implementation prompt under `docs/tasks/`
- `refresh` = re-read current repository sources before answering
- `lock` = treat a decision as authoritative and identify documents that must reflect it

Do not blur Source vs endpoint, approval vs lifecycle/operational state, operational state vs health, Article identity vs duplicate identity, Article visibility vs duplicate role, or external admin access control vs application resource validation.

## Authority and conflicts

Canonical authority is `docs/contracts/project-contract.md`:

1. locked laws;
2. explicit project-contract invariants;
3. domain/lifecycle contracts;
4. architecture/interface/security contracts and Accepted ADRs;
5. roadmap/implementation notes;
6. root summaries/routing (`AGENTS.md`, `README.md`, `BOOT.md`);
7. implementation;
8. historical task prompts;
9. comments/commit messages/stale notes.

Current user instruction controls task scope. A proposed locked-law change is a contract-change request, not permission for lower-authority work to override it silently.

Report authoritative conflicts rather than choosing silently.

## Document routing

| Area | Read first |
|---|---|
| Locked laws / authority / product boundaries | `docs/contracts/project-contract.md` |
| MVP users / demo-first capabilities / exclusions | `docs/contracts/mvp-scope-and-users.md` |
| Terminology / states / entities / identity / provenance | `docs/contracts/domain-and-data-contract.md` |
| Process/module architecture / staged Worker execution / scheduling / transactions | `docs/architecture/system-architecture.md` |
| Approval / bootstrap / collection / safety / parsing / normalization / Relevance / identity / run accounting | `docs/contracts/source-and-collection-contract.md` |
| Article visibility / duplicate role / review/groups / Primary | `docs/contracts/article-lifecycle-and-deduplication.md` |
| Public feed / search / themes / admin UX / change history | `docs/contracts/public-feed-and-admin-contract.md` |
| Admin perimeter / SSRF / content safety / isolation / observability / recovery | `docs/operations/security-reliability-and-operations.md` |
| Phase sequence / critical path / exit gates | `docs/roadmap/mvp-roadmap.md` |
| Topic-independent decision | `docs/decisions/topic-independent-publication-model.md` |
| Whitelist/structured-feed decision | `docs/decisions/whitelist-and-structured-feed-first.md` |
| Original-link/normalization decision | `docs/decisions/original-link-and-normalized-metadata.md` |
| Cloudflare Access admin perimeter | `docs/decisions/cloudflare-access-admin-perimeter.md` |
| Documentation index | `docs/README.md` |
| Implementation prompts | `docs/tasks/` when present |
| Validation artifacts | `docs/validation/` when present |

If a path does not exist, search for its current equivalent before assuming intentional deletion.

## High-risk project invariants

- Shared engine code remains topic independent.
- Source/endpoint approval/trust, lifecycle (`active/archived`), operational state (`enabled/paused/disabled`), and derived health are distinct.
- Bootstrap may explicitly create approved configuration as operator input but may not auto-discover/auto-approve, infer approval from fetch success, widen domains silently, or overwrite later operator-managed state on normal startup.
- Only collection-active Publications with approved + active + operationally enabled Sources/endpoints are contacted.
- Every request/redirect passes pre-fetch network-safety validation before contact.
- Parsed Article links pass a separate post-normalization Source/domain gate.
- Source approved domains are the maximum boundary; endpoint rules may narrow, not silently widen.
- Parsers output Raw items and never persist Articles directly.
- Source-shaped data is normalized before Relevance, identity, duplicate, or feed use.
- Relevance ordering is never bypassed: before configurable rules exist the empty rule set deterministically returns `include`.
- Configurable MVP Relevance uses deterministic include/exclude/categorize priority/scope rules; edits are prospective by default; automatic bulk historical reprocessing is deferred.
- Article identity is transactionally idempotent.
- Article observations preserve endpoint/run provenance.
- Minimal Collection-run persistence begins with the first real fetch in Phase 5 and expands as pipeline stages are introduced.
- During Phases 5–9, collection is manually invoked through the Worker; Web/API never fetches Sources inline.
- Phase 10 adds durable scheduling/jobs around the same endpoint execution unit.
- True-duplicate grouping applies to separately stored Articles.
- Article visibility is independent from duplicate role.
- Ordinary feed eligibility = visible + (`ungrouped` or `primary`).
- Weak duplicate evidence persists as review state; unchanged dismissed evidence does not recur indefinitely.
- Source runs/jobs fail independently and public-feed reads remain readable during collection failures.
- MVP admin UI/API routes are behind Cloudflare Access and supported deployments prevent direct-origin bypass.
- State-changing admin browser actions use CSRF/equivalent request-integrity controls when introduced; application commands still validate Publication/resource ownership.
- Native application administrator accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP.
- Push/webhook adapters and pinning/featured ordering are deferred beyond MVP unless explicitly promoted.

## Roadmap state

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 1 — Application foundation**.

Phase 0 is complete after the final full documentation review/alignment.

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

### Remaining MVP order

10. Phase 10 — Automated polling, durable jobs, and endpoint health
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

Do not advance by assumption. Verify each phase's exit gate before updating current phase.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe prompts.
- State allowed files when knowable.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests.
- Do not claim runtime/browser behavior unless observed.
- Prefer smallest correct incremental change.
- Trace shared helpers/consumers before changes.
- Before collection changes trace bootstrap/approval → lifecycle/operational state → manual/scheduled execution → lock → Collection run → network safety → fetch/redirect → parse → normalize → Article-link validation → Relevance → identity → observation → duplicate → run accounting → health → tests.
- Before Article/duplicate changes trace external IDs/canonical URLs/uniqueness → observations → review candidates → groups → Primary → moderation → feed → tests.
- Before admin changes trace Cloudflare Access perimeter → origin protection → request integrity → Publication/resource ownership → mutation → change history → tests.
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
Trace Publication → Source → endpoint → approval/lifecycle/operational state → execution/lock/run → safety → fetch → parse/normalize → link validation → Relevance → identity/observation → duplicate → run/health → consumers/tests.

### `/article-trace <field or concept>`
Trace Raw item → candidate → Relevance → Article identity/persistence → observations → overrides → duplicate role → feed/admin/tests.

### `/dedupe-trace <case>`
Trace Article identity separately from true-duplicate evidence, review state, groups, Primary, safeguards, moderation, feed/tests.

### `/blast-radius <change>`
Identify affected contracts, ADRs, schema/migrations, jobs/services/routes/read models/UI/tests/docs.

### `/regression <behavior>`
Trace suspected regression to likely change, affected invariants, and missing protection.

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

Do not silently run missing stages. If unstable requirements, contradictory docs, repository drift, or a material decision blocks progress, return `Planning needed` and stop before the next stage.

## `/prompt-ass`
Determine safe task boundaries from established behavior/contracts/roadmap. No writes.

Return target behavior, constraints, roadmap phase, prompt count/order, goal/summary/dependencies/boundary rationale/deferred behavior, and closeout task when needed.

## `/prompt-plan`
Requires completed `/prompt-ass` in current conversation. Perform source-level planning for every assessed prompt: contracts/ADRs, implementation, schemas/migrations, process roles, helpers/consumers/tests/recent changes, likely file scope, preserved behavior, risks, tests, runtime/browser validation, docs implications, acceptance criteria, non-goals.

Material boundary revisions produce `Planning needed`. No writes.

## `/prompt-write <folder name>`
Requires completed unblocked `/prompt-plan`. Revalidate current repo/docs and write one ordered `.txt` per approved prompt under:

```text
docs/tasks/<folder name>/
```

Do not overwrite existing tasks without explicit authorization.

Default names:

```text
P0-<short-task-slug>.txt
P1-<short-task-slug>.txt
P2-<short-task-slug>.txt
```

## Supporting prompt commands

- `/prompt <task>` — one prompt in conversation only.
- `/stack <goal>` — legacy shorthand for `/prompt-ass`.
- `/split <task>` — narrow assessment shorthand.
- `/revalidate <task or stack>` — compare existing task(s) to current repo/contracts.
- `/closeout <task>` — assess final regression/docs/runtime validation task.

# Review and validation commands

- `/review <commit, PR, task, implementation>`
- `/prove <behavior>`
- `/test-matrix <feature>`
- `/collector-check <source or collector>`
- `/dedupe-check <rule or case>`

These must honor current contracts, state separation, security, provenance, idempotency, failure isolation, and feed eligibility.

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

Finished implementation prompts normally include Task, Context, Current/Required behavior, roadmap phase, governing contracts/ADRs/laws, inspected source, allowed/forbidden files, constraints, preserved behavior, applicable security/provenance/idempotency/failure-isolation implications, risks, focused/broader tests, runtime/browser validation, docs updates, acceptance criteria, and non-goals.

Collection prompts preserve bootstrap/approval/lifecycle/operational boundaries, truthful Collection runs, pre-request network safety, run isolation, retry limits when applicable, and Source-domain policy.

Persistence/identity prompts address canonical Relevance ordering, transactional idempotency, and Article observations.

Duplicate prompts preserve every Article/observation, exactly one Primary/group, review-state persistence, false-positive safeguards, and manual reversibility.

Publication/Relevance prompts preserve topic independence, deterministic rule precedence, and prospective-by-default rule edits.

Public-feed prompts preserve original-publisher destination and visible ungrouped-or-Primary eligibility.

Admin prompts preserve Cloudflare Access/origin protection, request integrity, Publication/resource ownership validation, and the MVP prohibition on unnecessary native identity/account work.

# Repository modification rules

- Do not modify/commit unless authorized by current request/command.
- `/docs-review` never writes.
- `/docs-apply` writes only approved docs; invocation authorizes those documentation-only changes on `main` unless branch/PR requested.
- `/prompt-ass` and `/prompt-plan` never write.
- `/prompt-write` writes only approved task files in established task folder.
- No task writes while `Planning needed` remains unresolved.
- No speculative migrations/compatibility bridges.
- No topic conditionals in shared engine code.
- No Source/endpoint approval/state bypass or silent whitelist expansion.
- No parser-to-Article direct persistence.
- No Web/API inline Source fetching.
- No bypass of the Relevance boundary even before configurable rules exist.
- No deletion of Article/observation provenance because duplicate suppression exists.
- No weakening identity/duplicate/security boundaries to make tests pass.
- No MVP native administrator account/session/role subsystem unless explicitly promoted.
- Search all references before renames.
- Do not report tests/runtime/browser behavior as verified unless observed.
- Do not create PRs, merge, force-update history, or perform non-document history changes unless explicitly instructed.
- Preserve smallest viable diff for scoped fixes.

# Pre-production compatibility rule

Prefer one canonical design. Do not add old/new aliases, duplicate synchronized fields, fallback paths, or speculative migration compatibility unless explicitly required.

# Boot maintenance

Update BOOT when phase, core paths, terminology, commands, authority, locked laws, modification conventions, branch, repository identity, critical delivery ordering, or foundational security/deployment decisions change.

Detailed feature specifications belong in specialized contracts/ADRs. When BOOT conflicts with a higher-authority contract, the contract wins and BOOT must be corrected.
