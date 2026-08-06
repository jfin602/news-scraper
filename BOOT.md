# News Scraper Boot Document

This file is the session initialization contract for repository-aware work in this project. Read it first when starting a new ChatGPT or Codex session involving the repository.

Its purpose is to establish project identity, terminology, document authority, navigation rules, working conventions, shorthand commands, and repository safety rails.

It is a router and interpreter, not a replacement for detailed contracts, architecture documents, ADRs, implementation documentation, or tests.

## Project identity

- Repository: `jfin602/news-scraper`
- Default branch: `main`
- Product/repository name: News Scraper
- Platform definition: reusable, topic-independent news aggregation platform
- Current phase: Phase 0 — Contracts and product foundation
- Production status: pre-production
- Initial publication: publishing-industry news relevant to indie authors
- Public product direction: rolling recent-headline feed that sends readers to original publishers
- Administrative product direction: publication, source, endpoint, relevance, category, article, duplicate, collection-health, and audit control plane
- Core architectural constraint: publication-specific behavior remains configuration; shared aggregation-engine logic remains topic independent

## New-session startup

For project-wide planning or implementation work, refresh:

1. `BOOT.md`
2. `README.md`
3. `AGENTS.md`
4. `docs/00-project-contract.md`
5. `docs/08-mvp-roadmap.md`
6. The narrowest governing contract or ADR for the requested area
7. Relevant implementation and tests
8. Recent commits affecting the requested area when recency matters

Do not read every document indiscriminately. Follow the document-routing table below and inspect only sources relevant to the request.

For narrowly scoped work, read this file plus the governing contract, implementation files, tests, and relevant history.

An explicit request to review the docs, review all docs, perform a full documentation review, or run `/docs-review` is an intentional exception to normal scoped routing. Use the documentation-review scope defined below and infer any narrower or expanded scope from the current conversation.

## Canonical terminology

Terminology is governed by `docs/02-domain-and-data-contract.md`.

- `repo` or `source code` = `jfin602/news-scraper`
- `Platform` = reusable software system hosting collection, normalization, deduplication, administration, and public-feed capabilities
- `Publication` = configured news product with its own branding, timezone, categories, relevance rules, sources, and public feed; topic-specific behavior stops here
- `Source` = administrator-approved publisher/outlet belonging to one publication in the MVP
- `Source endpoint` = specific feed, API URL, or HTML listing page owned by a source; polling/parser/health state belongs here
- `Collection run` = one attempt to collect one source endpoint
- `Raw item` = minimally interpreted parser output
- `Article candidate` = normalized but not yet accepted record
- `Article` = persisted normalized source instance representing one discovered article URL or source-provided item identity
- `Primary article` = article selected to represent a true duplicate group in the public feed
- `Duplicate group` = same underlying published item represented by multiple stored article instances; one member is primary and all members remain stored
- `Related coverage` = distinct reporting about the same event/subject; not a true duplicate
- `Category` = publication-owned editorial grouping
- `Relevance rule` = publication-owned include/exclude/boost/categorize rule that must be explainable and auditable
- `contract` = locked behavioral requirement that implementation must preserve
- `ADR` = architecture decision record under `docs/decisions/`
- `docs` = repository documentation, not external documentation, unless stated otherwise
- `task` = implementation prompt stored under `docs/tasks/`
- `task stack` or `prompt stack` = ordered group of implementation prompts with dependencies
- `review the docs`, `review all docs`, or `full documentation review` = run the `/docs-review` workflow
- `full documentation scope` = every repository-tracked `.md` and `.txt` file, including root and module documentation, except files under `docs/tasks/` and `docs/validation/`
- `first pass` for documentation work = read-only analysis identifying what should change without modifying repository files
- `approved documentation findings` = findings, files, or change groups explicitly authorized for `/docs-apply` in the current conversation
- `prompt assessment` = latest completed ordered prompt split produced by `/prompt-ass`
- `prompt plan` = latest completed source-validated implementation plan produced by `/prompt-plan`
- `approved prompt plan` = completed prompt plan and accepted revisions; invoking `/prompt-write` with no unresolved blocker counts as approval unless the conversation says otherwise
- `prompt workflow` = enforced `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>` sequence
- `planning needed` = mandatory notice identifying a decision, contradiction, source uncertainty, or repository drift that blocks safe advancement
- `refresh` = re-read relevant repository sources before answering rather than relying only on conversation memory
- `lock` = treat a decision as authoritative and identify every governing document that must reflect it

Do not invent synonyms that blur Article identity, Duplicate identity, Source versus Source endpoint, or Publication versus Platform boundaries.

## Authority and conflict handling

Repository contract authority is defined by `docs/00-project-contract.md`.

When sources disagree, use this project order:

1. Locked project laws in `docs/00-project-contract.md`
2. Explicit invariants in `docs/00-project-contract.md`
3. Domain and lifecycle contracts
4. Architecture and interface contracts
5. ADRs that explain current foundational choices
6. Roadmap and implementation notes
7. Root `AGENTS.md` and `README.md` summaries
8. Existing implementation
9. Historical task prompts
10. Comments, commit messages, and stale planning notes

A current user instruction controls the requested task scope. If it explicitly proposes changing a locked law, treat that as a contract-change request rather than silently allowing lower-level work to override the law. The change process in `docs/00-project-contract.md` requires the affected contracts and ADRs to be updated intentionally.

Do not silently choose between conflicting sources. Report the conflict, identify the competing documents/code, and recommend the authoritative correction.

Existing code does not override a current contract merely because it is already implemented.

Historical task prompts describe intended work at the time they were written. They are not automatically current authority.

## Document routing

| Area | Read first |
|---|---|
| Documentation index and normative language | `docs/README.md` |
| Locked platform laws / product boundaries | `docs/00-project-contract.md` |
| MVP users, capabilities, exclusions, quality targets | `docs/01-mvp-scope-and-users.md` |
| Canonical terminology, ownership, entities, time, identity | `docs/02-domain-and-data-contract.md` |
| Process/module architecture, scheduling, transactions, technical baseline | `docs/03-system-architecture.md` |
| Source approval, fetching, polling, parsing, normalization, relevance, idempotency, health | `docs/04-source-and-collection-contract.md` |
| Article lifecycle, identity, duplicate grouping, primary selection, moderation | `docs/05-article-lifecycle-and-deduplication.md` |
| Public feed, search/filtering, themes, external links, admin UX | `docs/06-public-feed-and-admin-contract.md` |
| Auth security, SSRF, content safety, failure isolation, observability, recovery | `docs/07-security-reliability-and-operations.md` |
| Current phase sequence and exit gates | `docs/08-mvp-roadmap.md` |
| Topic-independent publication model decision | `docs/decisions/0001-topic-independent-publication-model.md` |
| Whitelist and structured-feed-first decision | `docs/decisions/0002-whitelist-and-structured-feed-first.md` |
| Original-link and normalized-metadata decision | `docs/decisions/0003-original-link-and-normalized-metadata.md` |
| Implementation prompts | `docs/tasks/` when present |
| Full documentation review | All tracked `.md` and `.txt` except `docs/tasks/` and `docs/validation/`, adjusted only by explicit conversation scope |
| Recent implementation history | Recent commits affecting the requested area |

When a referenced path does not exist, search for the current equivalent before assuming the document was intentionally deleted.

## Project-wide invariants

The ten locked laws from `docs/00-project-contract.md` apply to every phase:

1. The aggregation engine must never contain indie-author-specific business logic.
2. Every collected article must originate from an administrator-approved source.
3. RSS or other structured feeds are preferred over HTML scraping.
4. The original article URL remains the primary public destination.
5. All source-specific data must be normalized before reaching the public feed.
6. Repeated collection must be idempotent and must not create duplicate article records.
7. True duplicates are hidden behind one primary record, but all source instances remain stored.
8. Categories, relevance rules, branding, and sources belong to publication configuration.
9. A failing source must not interrupt collection from other sources.
10. Near-real-time means configurable polling unless a source explicitly supports push delivery.

Derived working invariants:

- Collector code operates on generic publications, sources, endpoints, candidates, articles, and duplicate groups.
- A disabled/unapproved source or endpoint cannot be collected.
- The collector never silently expands the whitelist from discovered links or public submissions.
- Public-feed code consumes normalized article data, not source-shaped parser payloads.
- Parser code does not write directly to article persistence.
- Source-specific adapters stay behind parser/fetcher boundaries.
- Relevance/category behavior is publication configuration and must be explainable.
- Article identity and duplicate identity remain separate concerns.
- Duplicate suppression never destroys provenance.
- Related coverage remains separate in the MVP.
- Weak duplicate evidence should not silently suppress distinct reporting.
- Endpoint collection jobs fail independently.
- Public-feed reads remain available during collection failures.
- SSRF/network safety and untrusted-content handling are architectural constraints, not optional hardening after collection is built.
- New behavior must include appropriate regression coverage.
- Do not weaken whitelist, provenance, identity, duplicate, or source-isolation boundaries merely to make one source easier to ingest.

## Canonical processing flow

The conceptual flow is:

```text
Publication configuration
        +
Approved Source / Source endpoint
        ↓
Scheduler + endpoint run lock
        ↓
Fetcher
        ↓
Parser adapter
        ↓
Raw item
        ↓
Normalizer
        ↓
Article candidate
        ↓
Safety / source / URL validation
        ↓
Publication relevance + categories
        ↓
Article identity resolution
        ↓
Duplicate grouping / primary selection
        ↓
Transactional persistence
        ↓
Normalized public-feed read model
        ↓
Original article URL
```

Do not treat this summary as permission to invent schema or field names outside `docs/02-domain-and-data-contract.md` and future migrations.

## Current roadmap state

`docs/08-mvp-roadmap.md` is the implementation sequence.

Current phase: **Phase 0 — Contracts and product foundation**.

Phase 0 exit gate:

- No unresolved contradiction among Phase 0 documents.
- Implementation tasks can cite a contract and measurable acceptance criteria.
- Topic-specific behavior is explicitly located in publication configuration.

Do not claim Phase 0 complete until those conditions have been evaluated.

Ordered future phases:

1. Phase 1 — Repository and application foundation
2. Phase 2 — Authentication, publication, and source administration
3. Phase 3 — RSS/Atom collection vertical slice
4. Phase 4 — Article persistence, relevance, and public feed
5. Phase 5 — Duplicate detection and moderation
6. Phase 6 — Configurable HTML collection
7. Phase 7 — Reliability, observability, and production hardening
8. Phase 8 — Customer launch validation

Do not pull deferred features or later-phase scope into an earlier prompt merely because implementation files are nearby.

## Working preferences

- Inspect current source and documentation before drafting implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- State exact files that may be modified whenever scope is knowable.
- Include non-goals and behavior that must remain unchanged.
- Require focused tests plus the relevant broader regression suite.
- Do not claim completion based only on code inspection when runtime/browser validation is required.
- Separate confirmed facts, inferred behavior, recommendations, and unresolved questions.
- Favor incremental tasks that can be reviewed independently.
- Prefer the smallest correct change over speculative architecture work.
- Trace shared helpers and data semantics across all consumers before changing them.
- Before changing collection behavior, trace approval, endpoint state, scheduling, locking, fetch, redirects, parsing, normalization, relevance, persistence, health, retries, and tests.
- Before changing article identity/deduplication, trace external IDs, canonical URLs, fingerprints, uniqueness constraints, grouping, primary selection, moderation, feed visibility, and tests.
- Before changing publication behavior, prove shared engine code remains topic independent.
- When recommending sequencing, choose a single best next task unless alternatives are materially different.
- When the user says `recommended`, make a concrete choice using current contracts, architecture, and roadmap.
- Do not invent repository state, file contents, source behavior, test results, browser results, or commit history.
- Documentation cleanup uses `/docs-review` then `/docs-apply`.
- Prompt creation uses `/prompt-ass` then `/prompt-plan` then `/prompt-write <folder name>`.
- Infer established context from the conversation and do not require the user to restate decisions, prompt lists, plans, or approvals.

## Conversation commands

Commands are conversational shorthand, not shell commands. Interpret them according to this section unless surrounding context clearly establishes another meaning.

### Context commands

#### `/boot`

Refresh `BOOT.md`, `README.md`, `AGENTS.md`, `docs/00-project-contract.md`, `docs/08-mvp-roadmap.md`, and the narrowest documents relevant to the request before answering.

#### `/refresh <area>`

Re-read source, docs, tests, and recent commits relevant to an area before answering.

#### `/state`

Summarize current implementation state, active phase, completed work, major constraints, and the next logical work.

#### `/route <topic>`

Identify which contracts, ADRs, source modules, tests, task files, and supporting docs govern a topic.

### Analysis commands

#### `/audit <area>`

Compare current contracts, ADRs, source, tests, recent changes, and observable behavior. Report disagreements, missing coverage, reliability gaps, and regression risks.

#### `/contract-check <area>`

Check whether implementation and tests match the governing contract and locked platform laws.

#### `/doc-check <area>`

Perform a narrow documentation check for the area established by the command and current conversation. Find source/documentation disagreement, stale references, duplicated authority, and missing updates. This does not replace `/docs-review`.

#### `/source-trace <source or behavior>`

Trace source behavior through Publication → Source → Source endpoint → approval/domain policy → scheduling → fetch → parser → normalization → relevance → identity/deduplication → persistence → health/run accounting → public/admin consumers → tests.

#### `/article-trace <field or concept>`

Trace an article field or identity concept through raw parser input, normalization, Article candidate, Article persistence, duplicate grouping, moderation, publication read models, feed output, and tests.

#### `/dedupe-trace <article or rule>`

Trace article identity and duplicate identity separately, including match signals, deterministic reason codes, source-instance preservation, primary selection, moderation overrides, false-positive safeguards, feed effects, and tests.

#### `/blast-radius <change>`

Identify affected contracts, ADRs, source adapters, schemas, migrations, jobs, services, routes, read models, UI, tests, compatibility surfaces, and documentation.

#### `/regression <behavior>`

Trace a suspected regression to likely source files, changed behavior, affected invariants, and missing test protection.

### Documentation commands

#### `/docs-review`

Perform the first, read-only pass of a documentation review.

Infer intended scope from the current conversation. When the conversation says to review the docs, review all docs, perform a full documentation review, or provides no narrower documentation scope, use the full documentation scope: every repository-tracked `.md` and `.txt` file except files under:

- `docs/tasks/`
- `docs/validation/`

When the conversation explicitly narrows the review to an area, feature, folder, file group, or concern, use that narrower scope. Read additional governing documents needed to identify conflicts accurately, but do not silently turn a scoped review into a full repository review.

The first pass must never modify repository files. Return:

- interpreted review scope
- documents reviewed
- documents excluded by rule or conversation scope
- conflicts between documents
- source/documentation drift when source inspection is part of scope
- stale or obsolete statements
- duplicated, misplaced, or unclear authority
- missing documentation or cross-references
- organization and document-routing problems
- recommended changes grouped by file
- recommended order for applying changes

Do not apply any recommendation during `/docs-review`, even if the original request says to clean up, align, tighten, or correct the docs. Wait for explicit approval or `/docs-apply`.

#### `/docs-apply`

Apply the approved second pass of a documentation review.

Infer exact edit scope from the current conversation, including the latest `/docs-review` findings and the findings/files/change groups the user approved. Do not require the user to repeat details already clear in context.

Before editing, re-read each approved target file and confirm repository drift has not invalidated the approved finding. If material drift changes the recommendation, report it instead of applying stale edits.

Apply only approved documentation changes. Preserve unrelated wording, structure, and authority. Do not add nearby cleanup merely because it is convenient.

After applying, report:

- files changed
- approved findings addressed
- approved findings not applied and why
- newly discovered conflicts left untouched
- remaining validation or documentation follow-up

Natural-language requests such as `apply the documentation fixes`, `make the approved doc changes`, or `apply the findings` should be interpreted as `/docs-apply` when approved scope is clear.

### Prompt workflow commands

The primary prompt workflow is strictly ordered:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Each stage infers target behavior, scope, decisions, and prior-stage output from the current conversation. Do not require the user to repeat information already clear.

The workflow assumes target behavior has been discussed and governing documentation is stable. If documentation is materially incomplete, contradictory, or outdated, issue a `Planning needed` notice rather than planning against uncertain requirements.

Workflow order is enforced:

- `/prompt-ass` is required first.
- `/prompt-plan` may run only after `/prompt-ass` completes successfully in the current conversation.
- `/prompt-write <folder name>` may run only after `/prompt-plan` completes successfully and no unresolved `Planning needed` notice remains.
- Invoking a later stage out of order must not cause missing earlier stages to run silently. Report the prerequisite, recommend the exact next command, and stop.
- Invoking `/prompt-write` after a completed, unblocked `/prompt-plan` counts as approval of that plan unless the conversation explicitly rejects or narrows it.

At any stage, when more planning is needed, return a clearly labeled `Planning needed` section containing:

- current workflow stage
- unresolved decision, contradiction, source uncertainty, or repository drift
- why it affects prompt boundaries or implementation safety
- recommended resolution
- exact user decision/additional context that would help
- command to run after resolution

Do not advance the workflow or write task files while a blocking `Planning needed` item remains unresolved.

#### `/prompt-ass`

Perform the prompt-assessment stage.

Use current conversation context, target behavior, locked decisions, governing contracts, roadmap phase, known constraints, and completed documentation work to decide how implementation should be divided into Codex prompts.

This stage determines task boundaries. It does not perform full source-level implementation analysis and does not modify repository files.

Return:

- target behavior
- confirmed decisions and governing constraints
- current roadmap phase and phase boundary
- recommended number of prompts
- ordered prompt list
- goal and concise summary of each prompt
- dependencies between prompts
- why each boundary is safe and independently reviewable
- behavior deliberately deferred
- final regression/closeout prompt when needed

Prefer the smallest number of prompts that remain independently implementable, reviewable, and regression-safe.

Split when tasks have materially different module ownership, schema/migration risk, collection risk, security boundary, validation requirement, dependency order, or rollback boundary. Do not split simply to create more prompts.

Do not combine work when doing so creates an oversized prompt, mixes unrelated behavior, obscures failure diagnosis, or crosses too many architectural layers at once.

A prompt assessment is complete only when target behavior is sufficiently defined, governing docs are stable, phase boundaries are respected, prompt boundaries are explicit, and no blocking `Planning needed` item remains.

Natural-language requests such as `assess the prompt split`, `decide the task split`, or `how many prompts should this take` should be interpreted as `/prompt-ass` when target behavior is clear.

#### `/prompt-plan`

Perform the source-level implementation-planning stage for the current prompt assessment.

This command requires a completed `/prompt-ass` in the current conversation. If none exists, do not infer or silently perform it. Report that `/prompt-ass` is required and stop.

For every assessed prompt:

- inspect current governing contracts and ADRs
- inspect current implementation
- inspect relevant schema/migrations, web/worker roles, schedulers, fetchers, parsers, normalization, relevance, article services, deduplication, routes/read models, UI, configuration, observability, and tests as applicable
- inspect recent relevant commits when recency matters
- identify exact files likely to change
- identify files and behavior that must remain unchanged
- trace shared helpers and affected consumers
- identify dependencies on earlier prompts
- identify security, idempotency, provenance, duplicate, and failure-isolation risks where applicable
- define focused tests
- define broader regression coverage
- define runtime/browser validation when applicable
- identify documentation updates still required
- define acceptance criteria and explicit non-goals

Return an ordered implementation plan grouped by prompt.

Each planned prompt must include:

- prompt identifier and title
- implementation goal
- current behavior
- required behavior
- governing contracts/ADRs
- current roadmap phase
- source files inspected
- files expected to change
- files that must not change
- planned implementation approach
- dependencies and sequencing
- preserved behavior
- regression/security/data-quality risks
- required focused tests
- required broader tests
- runtime/browser validation when applicable
- documentation implications
- acceptance criteria
- non-goals

Validate the `/prompt-ass` split against current source. If source analysis shows prompts should be merged, split, reordered, or changed, report the revised list and explain why.

When a revision creates materially different scope, dependency, migration boundary, security posture, roadmap-phase crossing, or user-visible behavior, issue `Planning needed` before advancing.

Do not modify source, documentation, or task files during `/prompt-plan`.

A prompt plan is complete only when every prompt has a source-validated path, file scope, dependency order, test strategy, acceptance criteria, and no unresolved blocker.

Natural-language requests such as `plan the prompts`, `analyze the repo for these prompts`, or `build the implementation plans` should be interpreted as `/prompt-plan` only when a completed prompt assessment exists.

#### `/prompt-write <folder name>`

Write the completed prompt plan into repository task files.

This command requires a completed, unblocked `/prompt-plan`. If none exists or a `Planning needed` blocker remains, do not create files. Report the missing prerequisite and stop.

Infer the prompt list, plans, approved revisions, behavior, and constraints from current conversation context. Do not ask the user to repeat information already established.

Write prompts under:

```text
docs/tasks/<folder name>/
```

Git does not track empty folders; create the destination by creating the first task file.

Before writing:

- re-read `BOOT.md`
- re-read `docs/00-project-contract.md`
- re-read `docs/08-mvp-roadmap.md`
- re-read governing contracts/ADRs
- re-read every source file materially relied upon by the approved plan
- confirm recent repository changes have not invalidated prompt boundaries or implementation plan
- check whether destination paths already exist
- preserve an established task naming convention when present

If material drift invalidates the plan, issue `Planning needed` and do not write stale prompts.

Write one ordered `.txt` file per prompt unless the conversation explicitly establishes another format.

Each prompt must follow the `Codex prompt requirements` below and be:

- implementation-ready
- file-scoped whenever analysis supports exact scope
- regression-safe
- explicit about locked laws and governing contracts
- explicit about preserved behavior
- explicit about allowed and forbidden changes
- explicit about dependencies on earlier prompts
- independently reviewable
- complete enough to run in a fresh Codex session

Use stable ordered filenames. When no convention is established, use:

```text
P0-<short-task-slug>.txt
P1-<short-task-slug>.txt
P2-<short-task-slug>.txt
```

After writing, report:

- destination folder
- files created
- files updated, if explicitly approved
- prompt order
- purpose of each prompt
- approved prompt not written and why
- repository drift or unresolved risk discovered
- recommended first prompt to execute

Do not overwrite an existing task file without explicit authorization.

Do not create extra prompts, indexes, READMEs, documentation, or cleanup changes outside the approved plan.

Natural-language requests such as `write the planned prompts`, `save this task stack`, or `create these prompts in <folder>` should be interpreted as `/prompt-write` when folder and approved plan are clear.

### Supporting prompt commands

#### `/prompt <task>`

Produce one implementation-ready Codex prompt in the conversation without writing it to the repository.

Use this for a genuinely isolated one-prompt task or when the user explicitly asks to skip repository writing. It does not satisfy a missing `/prompt-ass` or `/prompt-plan` prerequisite for later `/prompt-write`.

#### `/stack <goal>`

Legacy shorthand for assessing an ordered task stack. Interpret as `/prompt-ass` unless context clearly requests another non-writing output.

#### `/split <task>`

Legacy shorthand for evaluating whether one task should be divided. Interpret as a narrowly scoped `/prompt-ass`.

#### `/revalidate <task or stack>`

Check whether an existing task or task stack still matches current contracts, ADRs, roadmap, source, tests, and recent changes.

#### `/closeout <task>`

Assess and plan the final regression, documentation, runtime/browser validation, and acceptance prompt required to close a task or stack.

### Review and validation commands

#### `/review <commit, PR, task, or implementation>`

Review implementation against its prompt, governing contracts/ADRs, locked laws, roadmap phase, tests, affected consumers, whitelist boundaries, provenance, security, and source failure isolation.

#### `/prove <behavior>`

Define or perform tests and validation needed to demonstrate the behavior is correct.

#### `/test-matrix <feature>`

Build a state/situation matrix with inputs, expected behavior, persistence effects, idempotency/duplicate implications, failure handling, and security boundaries.

#### `/collector-check <source or collector>`

Define or perform validation for source approval, endpoint safety, retrieval, redirect policy, parsing, normalization, retry safety, failure isolation, run accounting, and observed outcomes.

#### `/dedupe-check <rule or case>`

Define or perform validation for article identity, duplicate grouping, primary selection, provenance retention, false-positive safeguards, moderation overrides, and feed output.

### Decision commands

#### `/lock <decision>`

Treat the stated decision as authoritative project direction and identify every contract/ADR/root summary/task that should change to preserve it.

Do not modify files unless explicitly instructed.

If the decision amends a locked law, follow the contract-change process in `docs/00-project-contract.md` rather than editing lower-authority documents only.

#### `/recommend`

Choose the best option based on locked laws, current contracts, architecture, roadmap phase, user value, reliability, security, and implementation risk rather than returning an undecided list.

#### `/status`

Give only these sections:

- Completed
- Current
- Blocked
- Next

#### `/next`

Recommend the single most logical next task and briefly explain why it should precede alternatives.

## Command modifiers

Modifiers refine commands without creating separate command names.

- `--deep` = extended source, documentation, test, and history analysis
- `--quick` = focused answer without broad repository review
- `--docs-only` = inspect documentation but not implementation
- `--code-only` = inspect implementation without proposing documentation changes
- `--no-write` = do not modify repository files
- `--prompt-only` = return only the finished Codex prompt
- `--file-scoped` = explicitly constrain allowed files
- `--regression-safe` = include preserved behavior, risks, and regression tests
- `--latest` = inspect recent relevant commits
- `--browser` = include browser validation for affected UI behavior
- `--db` = include schema, migrations, queries, uniqueness/idempotency, duplicate, and recovery implications
- `--tests` = prioritize test coverage and validation details
- `--contracts` = explicitly enumerate governing contracts, ADRs, and locked laws
- `--sources` = include source/endpoint approval, scheduler, fetcher, parser, health, retry, and failure-isolation analysis
- `--dedupe` = include article identity, duplicate grouping, provenance, primary selection, and false-positive analysis
- `--security` = explicitly inspect authentication, authorization, CSRF/session, SSRF, content safety, secrets, limits, and abuse boundaries where relevant
- `--reassess` = allow `/prompt-plan` to substantially revise `/prompt-ass` boundaries when source analysis reveals a safer split; material revisions still require `Planning needed` before writing

Examples:

```text
/boot
/docs-review
/docs-apply the approved Phase 0 consistency fixes
/prompt-ass
/prompt-plan --deep --latest --contracts
/prompt-write phase-1
/audit collection --deep --sources --security
/source-trace example-source --sources
/article-trace canonical URL --db
/dedupe-trace duplicate identity --dedupe --tests
/review latest collector commit --contracts --tests --security
/next
```

## Codex prompt requirements

A finished implementation prompt should normally include:

- Task
- Context
- Current behavior
- Required behavior
- Current roadmap phase
- Governing contracts and ADRs
- Locked project laws affected
- Source files inspected
- Files allowed to change
- Files that must not change
- Implementation constraints
- Preserved behavior
- Security implications when applicable
- Data/provenance/idempotency implications when applicable
- Source failure-isolation implications when applicable
- Regression risks
- Required focused tests
- Required broader regression tests
- Runtime/browser validation when applicable
- Documentation updates
- Acceptance criteria
- Explicit non-goals

When exact files are not known, instruct Codex to inspect first and then constrain changes to the smallest relevant set.

Do not use vague instructions such as `fix this` when expected behavior can be explicit.

Do not require implementation details that conflict with current architecture merely to make a prompt appear specific.

A collection prompt must explicitly preserve approved-source/endpoint boundaries, SSRF protections, run isolation, and safe retry behavior.

A persistence or identity prompt must explicitly address idempotency and transactional uniqueness.

A duplicate prompt must explicitly preserve all Article instances, exactly one Primary article per group, false-positive safeguards, and manual reversibility.

A publication/relevance/category prompt must explicitly preserve topic independence of shared engine modules.

A public-feed prompt must explicitly preserve original-publisher destination behavior and visible-primary-only semantics where relevant.

## Repository modification rules

- Do not commit or modify files unless explicitly instructed.
- `/docs-review` must never modify repository files.
- `/docs-apply` may modify only documentation findings explicitly approved in the current conversation.
- `/prompt-ass` and `/prompt-plan` must never modify repository files.
- `/prompt-write` may modify only the approved task files under the conversation-established `docs/tasks/<folder name>/` scope.
- Do not silently run missing earlier prompt-workflow stages.
- Do not create/update task files while a blocking `Planning needed` notice remains unresolved.
- Do not overwrite an existing task file without explicit authorization.
- Do not create migrations speculatively.
- Do not rewrite unrelated code during a regression fix.
- Do not add publication-topic conditionals to shared engine code as a shortcut.
- Do not bypass Source/Source endpoint approval boundaries.
- Do not allow discovered links to expand the whitelist silently.
- Do not let parser adapters persist directly to Article tables.
- Do not delete Article/source provenance merely because a Primary article exists.
- Do not weaken idempotency or duplicate safeguards to make tests pass.
- Do not change locked terminology casually.
- Do not treat historical task prompts as current contracts.
- Before changing shared helpers, identify all call sites.
- Before changing data semantics, inspect schema/migrations, collection, normalization, relevance, persistence, deduplication, moderation, read models, UI, and tests as applicable.
- Before changing external fetching, inspect approval/domain policy, DNS/address/redirect validation, timeouts, response limits, retries, logs, and tests.
- Before renaming files, routes, fields, or concepts, search all references and migration/compatibility requirements.
- Do not report tests as passing unless actually run and observed.
- Do not report collector/source behavior as verified unless actually exercised or supported by observed evidence.
- Do not report browser behavior as verified unless actually tested.
- Do not push directly to a branch, create a PR, merge, or alter repository history unless explicitly instructed.
- Preserve the smallest viable diff for scoped fixes.

## Pre-production compatibility rule

The project is pre-production. Prefer one canonical design over compatibility bridges.

Do not add duplicate old/new fields, aliases, synchronized representations, fallback paths, or speculative migration compatibility unless a current task explicitly requires a one-time migration path.

## Boot document maintenance

Update this file when:

- the project enters a new phase
- a core contract/ADR is added, moved, renamed, or retired
- terminology changes
- a shorthand command is added or changed
- authority priority changes
- a locked project law is amended
- repository modification conventions change
- the default branch or repository identity changes

Do not place detailed feature specifications here. Link to authoritative contracts.

Do not copy large contract sections here. Summarize only stable project-wide rules needed to route and interpret work.

When this file disagrees with a current locked contract, the contract wins and this file should be corrected.
