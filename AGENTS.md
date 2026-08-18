# AGENTS.md

## Project and authority

News Scraper is a reusable, topic-independent news aggregation Platform. Each installation hosts exactly one Publication/topic; another topic uses another configured deployment of the shared codebase. Publication is singleton editorial/configuration state, not a relational tenant key. Canonical public surfaces are `/` and `/api/feed`.

Read `BOOT.md` first and route through `docs/README.md` to the narrowest authority. `docs/contracts/project-contract.md` owns locked laws and top-level invariants; specialized contracts own behavior; Accepted ADRs own architectural decisions; `docs/contracts/testing-and-validation-contract.md` owns proof; `docs/roadmap/mvp-roadmap.md` owns phase state. Historical validation records only what was observed at its exact SHA/environment and never redefines current contracts.

If work conflicts with a locked law, report the conflict. Do not silently treat code, a summary, or historical evidence as higher authority.

## Documentation workflow

Follow `BOOT.md`.

- `/docs-review` is read-only. Documentation changes require approved findings plus `/docs-apply`, or the snapshot-based `/docs-prompt` path.
- `/docs-apply` changes only approved documentation scope. Preserve unrelated wording.
- Normal non-terminal handoff is `/closeout` → `/docs-review` → `/docs-apply` → `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.
- Roadmap `/closeout` and a correction stack's final manual closeout are different. A correction closeout clears only that correction and preserves roadmap phase/package version.
- Terminal Phase 21 `/closeout` verifies the closeout, preserves the final package version, and reports `Roadmap status: COMPLETE`; it never invents Phase 22 or `0.22.0`.
- Use `docs/codex-model-selection.md` for detailed minimum-cost-adequate model/reasoning/usage policy.

## Versioning and task-stack grammar

`package.json` is the sole current-version authority. Documentation, correction, UI, and terminal-closeout work is non-versioned. A version changes only through an executed roadmap prompt, a green non-terminal `/closeout` baseline transition, or another explicit owner-authorized transition.

The machine parser is `scripts/codex-phase-core.mjs`; parser changes must update BOOT and focused parser tests. Before reporting `/prompt-write` complete, run `npm run codex:phase:validate -- <task-folder>` when local execution is available. `npm run codex:phase -- <task-folder>` executes implementation prompts and stops before the parsed final closeout prompt.

Common grammar:

- filenames are `P<number>-<lower-kebab-slug>.txt`, one-based, unique, and contiguous from P1;
- every prompt has exactly one `- Recommended configuration:` line containing one supported backtick-delimited `MODEL_CONFIGS` label and a final period;
- exactly one final prompt is the manual closeout; both its filename slug and parsed `TASK:` title contain `closeout`; body prose does not determine prompt kind.

Roadmap stacks:

- folder `p<number>` with no leading zero;
- exact header `TASK: Phase <phase> / P<number> — <title>` matching folder/filename;
- exactly one `assigned project version is` phrase followed by backtick-delimited `0.<phase>.<prompt number>`;
- no correction unchanged-version metadata.

Correction stacks:

- folder `c<roadmap-phase>-<lower-kebab-slug>`;
- exact header `TASK: Correction <phase> / P<number> — <title>` matching folder/filename;
- exactly one `- Required unchanged project version: `<version>`.` line in every prompt, identical across the stack and equal to `package.json` throughout execution;
- no assigned-version metadata; P-numbers are local and do not consume roadmap patch numbers;
- correction commits identify the correction stack/prompt, and its closeout does not invoke/substitute for roadmap `/closeout`.

Targeted UI prompts under `docs/design/tasks/` are not a third `codex:phase` grammar. They follow `docs/design/ui-workflow.md`, identify `Workstream: UI`, execute on `ui-polish`, preserve package version/roadmap state, and never imply automatic merge/integration.

## High-risk implementation guardrails

Always preserve these boundaries and read the routed contract for detail:

- Shared aggregation logic remains topic independent. Do not introduce Publication IDs/slugs/FKs/joins/uniqueness scopes/repository parameters/authorization scopes or compatibility aliases solely for hypothetical concurrent hosting.
- Source is the approved publisher/trust boundary; endpoint is its concrete feed/API/HTML location. Approval, lifecycle, operational state, and derived health are distinct.
- Only approved, active, enabled Sources/endpoints are collectable while singleton Publication collection is active. Bootstrap never auto-discovers/auto-approves, infers trust from fetch success, widens domains silently, or overwrites later operator state.
- Every request and redirect hop passes approval plus DNS/address/port/SSRF checks before contact. Normalized Article links pass the separate Source/domain policy gate. Endpoint policy may narrow the Source maximum, never widen it.
- Parsers produce Raw items and never persist Articles. RSS/Atom admission filtering is Source-owned, literal include-only, before normalization, and distinct from Relevance; a mismatch is neither a Relevance exclusion nor an Article observation. HTML bypasses that RSS/Atom-only gate.
- Normalization precedes Article-link policy, Relevance/Categories, identity, duplicates, and feed use. Relevance exclusion terminates before identity; rule edits are prospective by default and do not automatically rewrite historical Articles.
- Article identity is Source-scoped and transactionally idempotent. True-duplicate identity relates separately stored Articles. Weak evidence becomes review state; every Article/observation remains stored, every group has exactly one Primary, and related coverage remains distinct.
- Article visibility and duplicate role are independent. Collection activity, endpoint operational state, and current run health do not themselves hide retained otherwise-feed-eligible rows.
- Preserve Source/endpoint/run/Article/observation relationships and provenance. Source failures remain isolated; Web/API never collects Sources inline.
- Public headlines use stored `original_url`; `canonical_identity_url` remains an identity field. `/api/feed` and `/` share the canonical feed read model rather than parallel eligibility/query paths.
- Admin uses Cloudflare Access with direct-origin protection, request-integrity controls, and application validation of real resource relationships/domain invariants. Do not add speculative native account/session/role or Publication-tenant authorization systems.

The eleven locked laws remain authoritative in `docs/contracts/project-contract.md`; this guardrail list does not replace them.

## Production compatibility

The accepted Phase 20 launch artifact defines the first supported production source/version/schema baseline. Customer data and governed relationships are durable supported state; supported migration history remains upgrade-capable. Clean migration from zero remains required for new/disposable installations but never substitutes for supported baseline upgrade/data-preservation proof.

Do not apply the earlier pre-production destructive-reset rule to customer state. Do not rewrite supported migration history merely to make the final schema look cleaner. For persistence changes, trace baseline → forward migration → data/relationship preservation → backup/rollback/restore → consumers/tests under `docs/decisions/production-data-and-schema-compatibility.md`.

## Validation honesty

- Every implementation change needs focused automated coverage plus relevant broader regression coverage for its blast radius.
- Producer prompts with planned downstream consumers must map every downstream-required capability to its owning implementation/export and focused proof; the consumer must not invent producer-owned SQL, cursor, domain, transaction, validation, topology, or state semantics.
- Use narrow focused suites during iteration and the smallest non-overlapping final command set covering all required evidence. Do not duplicate subordinate suites already executed by an aggregate command on the unchanged tree.
- Evidence applies only to the exact final tree tested. Source inspection is not runtime proof, HTTP integration is not browser proof, fixtures are not live-Source proof, and mocks do not prove PostgreSQL guarantees.
- Explicitly required suites fail when prerequisites are absent, skipped, flaky, or select zero tests.
- Persistence/concurrency/migration claims require real disposable PostgreSQL where applicable. Ordinary isolated test files may reuse one migrated disposable database with deterministic state reset; lifecycle/schema-mutation claims retain fresh-database proof.
- Deterministic collection validation uses controlled fixtures/servers without weakening production trust or SSRF policy.
- Phase 21 refactors inherit the applicable full evidence matrix; schema changes require migration-from-zero plus supported Phase 20-baseline upgrade/data preservation, performance/resource claims require comparable before/after measurements, and final closeout requires governed Level 8 evidence.

The Phase 9 owner acceptance retains its recorded incomplete two-Source Level 7 observation. The Phase 14 owner acceptance retains its historical BLOCKED/RED Level 8 limitation; Phase 19 later supplied that deployment-perimeter proof without rewriting history.

## Roadmap state

**Phase 21 — Codebase simplification and maintainability hardening** is current and terminal. Accepted Phase 20 established the supported production baseline and feature freeze. Phase 21 removes only evidence-backed accidental complexity or measured inefficiency while preserving launched behavior, real integrity/provenance/security boundaries, and supported customer data. No deferred feature is implemented until Phase 21 closes, except bounded critical production/security/data-integrity/operational fixes. Later roadmap work requires explicit repository-owner approval and documentation alignment.

Use `docs/roadmap/mvp-roadmap.md` for detailed phase history and exit gates.

## UI workstream

UI work is governed by `docs/design/ui-workflow.md` on permanent branch `ui-polish`. Keep it in a separate worktree from active roadmap/correction runner work. It is non-versioned and does not advance roadmap/correction state.

Normal path: `/ui-plan` → `/ui-write`. If durable design guidance is missing, contradictory, materially ambiguous, or must change: `/ui-review` → explicit approval → `/ui-apply` → rerun `/ui-plan` → `/ui-write`. A blocked earlier plan never authorizes writing. Do not force-update shared history or merge `ui-polish` automatically; prompt completion does not imply integration.

## Working preferences

- Inspect current source/docs and shared producers/consumers before planning or editing.
- Prefer the smallest file-scoped, regression-safe change; state non-goals and preserved behavior.
- Split a complex transaction/state-machine responsibility from an independently consumed read/service/API responsibility when consumers, tests, or failure risks materially differ.
- For Phase 21, work only from accepted candidate assessment and observed evidence. Do not optimize for raw LOC/file/module/dependency counts or manufacture cleanup.
- For collection changes, trace endpoint type/profile → approval/state → lock/network safety → fetch/redirect → parser/admission → normalization/link policy/Relevance/identity/persistence/duplicates → run/health/admin consumers.
- For public work, trace singleton settings → canonical read model → `/api/feed` → `/` → unavailable/errors/external links → browser coverage.
- Search all references before renames. Never invent repository state, test results, Source behavior, or history.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
