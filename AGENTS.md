# AGENTS.md

## Project Name

News Scraper

## Project Goal

Build a reusable, topic-independent news aggregation Platform that collects Article metadata only from administrator-approved Sources, normalizes Source-specific input, persists Articles idempotently with endpoint/run provenance, suppresses true duplicates without destroying Source instances, and serves Publication-specific rolling feeds whose headlines link to original publishers.

The first configured Publication is publishing-industry news relevant to indie authors. That is Publication configuration, not aggregation-engine identity.

## Documentation Workflow

Follow `BOOT.md`.

- `/closeout` is the phase-handoff command after a roadmap phase has formally closed. It performs a quick closeout/evidence check and, only when green, advances `package.json` to `0.<next phase>.0`.
- `/docs-review` is always a read-only first pass.
- Do not modify documentation during review/cleanup/alignment until findings are approved or `/docs-apply` is invoked.
- `/docs-apply` authorizes only approved documentation changes and may commit them directly to `main` unless the user requests otherwise.
- Preserve unrelated wording during scoped documentation fixes.
- Normal phase handoff follows `/closeout` → `/docs-review` → `/docs-apply` → `/prompt-ass` → `/prompt-plan` → `/prompt-write <folder name>`.

## Versioning Workflow

Follow the canonical versioning and prompt-numbering rules in `BOOT.md`.

- Phase prompt filenames are one-based: `P1`, `P2`, `P3`, and so on; do not create `P0` tasks.
- Project versions use `0.<roadmap phase>.<phase prompt number>` while pre-1.0.
- `0.<phase>.0` is the phase baseline. After a roadmap phase formally closes, `/closeout` is the canonical handoff: it verifies the closeout and, on a green result, performs the next `0.<new phase>.0` transition. That transition consumes no prompt number; P1 still maps to `.1`, P2 to `.2`, and so on.
- Invoking `/closeout` constitutes explicit repository-owner authorization for its green-path version-only transition. The baseline never changes merely because a phase appears complete.
- `package.json` is the sole authoritative current-version source; do not duplicate the current version in docs or source constants.
- The project intentionally does not use npm package locks. Repository npm configuration disables `package-lock.json` generation; dependency installation uses `package.json` rather than lockfile metadata.
- Project version changes occur only through execution of a new Codex roadmap-phase prompt, a green `/closeout` transition, or another explicit owner-authorized `.0` transition after the prior phase closes. Other documentation/prompt/review workflow activity does not increment the version.
- Re-running or correcting the same prompt keeps that prompt's assigned version rather than consuming a new number.

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
docs/decisions/topic-independent-publication-model.md
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

## Canonical domain law

Use terminology from `docs/contracts/domain-and-data-contract.md`.

High-risk distinctions:

- Publication is the topic-specific configuration boundary.
- Source is a configured publisher/outlet whose approval state determines trust; Source endpoint is the concrete feed/API/HTML location.
- Approval/trust, configuration lifecycle, operational state, public visibility, moderation state, duplicate role, and derived health are separate.
- Active configuration may be enabled/paused/disabled; archived configuration is retired and not collectable.
- Collection run is one endpoint attempt and begins as persisted provenance with the first real fetch phase.
- Raw item is parser output; Article candidate is normalized but not yet accepted.
- Article is a persisted normalized Source instance.
- Article observation preserves endpoint/run provenance without increasing Article cardinality.
- Article identity and true-duplicate identity are separate questions.
- Duplicate review candidate persists uncertain/dismissed duplicate decisions.
- Duplicate group contains separately stored true-duplicate Articles with exactly one Primary.
- Article visibility (`visible/hidden/archived`) is separate from duplicate role (`ungrouped/primary/non_primary`).
- Ordinary feed eligibility is visible + (`ungrouped` or `primary`).

## Collection law

Governed by `docs/contracts/source-and-collection-contract.md`, `docs/architecture/system-architecture.md`, and `docs/operations/security-reliability-and-operations.md`.

- Only collection-active Publications with approved, active, operationally enabled Sources/endpoints are collectable.
- Operator-maintained bootstrap may explicitly create approved configuration but may not auto-discover/auto-approve, infer approval from fetch success, widen approved domains silently, or overwrite later operator-managed state.
- Pre-fetch and every redirect hop pass approval + DNS/address/port/SSRF validation before network contact.
- Parsed Article links pass a separate post-normalization Source/domain policy gate.
- Source approved domains are the maximum boundary; endpoint policy may narrow, not silently widen.
- Structured-first order: RSS/Atom → stable API/feed → HTML extraction → custom adapter → browser fallback.
- Adapter interfaces are established with RSS/Atom and reused by later Source types.
- Parsers produce Raw items and never persist Articles directly.
- Normalization precedes Relevance, identity, duplicate, and feed behavior.
- Before configurable Relevance rules exist, the canonical Relevance boundary runs with an empty rule set and returns deterministic default `include`.
- Configurable MVP Relevance actions are include/exclude/categorize with explicit priority/scope tie-breaks; edits are prospective by default and automatic bulk historical reprocessing is deferred.
- Repeated Source observations converge transactionally on one Article identity.
- During Phases 5–9, collection is manually invoked through Worker endpoint runs; Web/API never fetches Sources inline.
- Phase 10 adds durable jobs/scheduling around the same endpoint execution unit.
- Endpoint runs/jobs fail independently and public-feed reads remain available.

## Article and duplicate law

Governed by `docs/contracts/article-lifecycle-and-deduplication.md`.

- Article identity prevents repeated polling from inserting the same Source instance.
- True duplicate grouping applies to separately stored Articles.
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

Public completed MVP:

- reverse chronological rolling feed;
- desktop `Date | Headline | Source`;
- accessible stacked mobile layout;
- original Article destination;
- Category/Source filters, keyword search, deterministic pagination;
- light/dark modes;
- no MVP pinning/featured ordering.

Phase 9 intentionally reaches a basic real-data feed before discovery/presentation polish.

Admin MVP:

- full admin UI/API routes are introduced after the public tech-demo vertical slice;
- Cloudflare Access is the external access perimeter;
- supported deployments prevent direct-origin admin bypass;
- state-changing browser actions use CSRF/equivalent request-integrity controls;
- application commands validate Publication/resource ownership;
- native application accounts/sessions/roles/account recovery/per-user Publication authorization/identity-linked audit attribution are deferred beyond MVP;
- Source/endpoint management, Publication/Relevance administration, Article moderation, duplicate review, and bounded change history arrive in their roadmap phases.

## Validation law

Governed by `docs/contracts/testing-and-validation-contract.md`.

- Automated behavioral regression coverage is the primary protection against implementation regressions.
- Every implementation change requires focused tests for the changed behavior plus relevant broader regression coverage for its blast radius.
- Test evidence applies to the exact final source tree that was executed; earlier passing evidence does not automatically validate later changes.
- Source inspection is not runtime proof, HTTP integration is not browser proof, fixture collection is not live-Source proof, and mocks do not prove PostgreSQL transactions/constraints/locks.
- Persistence guarantees use real disposable PostgreSQL where practical from Phase 2 onward.
- Ordinary deterministic local regression validation must not depend on live public publishers; deterministic collection uses controlled fixtures/servers without weakening production SSRF or whitelist policy.
- Explicitly invoked required suites fail clearly when prerequisites are missing and must not silently skip green.
- Zero matched tests in a required filtered suite is a failure.
- Flaky/skipped tests do not satisfy implementation-roadmap exit gates for the behavior they would have proved.
- Every reproducible defect should receive regression coverage when technically practical.
- Every implementation roadmap phase inherits the testing contract even when its phase entry does not repeat the entire matrix.
- Implementation-roadmap phase closeout requires executed local terminal evidence and a durable `docs/validation/` artifact tied to the exact accepted commit/source tree.

## Roadmap law

Use `docs/roadmap/mvp-roadmap.md`.

Current phase: **Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, and Phase 4 Collection eligibility and network safety implementation/validation are complete. Phase 5 is active. Phases 1–9 remain the tech-demo critical path; do not pull later admin/discovery/deduplication work into those phases without a true dependency or explicit decision.

## Working preferences

- Inspect current source/docs before implementation prompts.
- Prefer file-scoped, regression-safe Codex prompts.
- Include non-goals and preserved behavior.
- Require focused + broader regression tests and name the evidence level needed to prove acceptance.
- Do not claim runtime/browser/database/live-Source behavior unless actually observed at the corresponding evidence level.
- Prefer smallest correct changes over speculative refactors.
- Trace shared helpers/consumers before changing data or collection semantics.
- Confirm applicable local validation commands/suites were actually executed against the final tree before approval.
- Confirm each Codex phase prompt uses its assigned one-based prompt number/version and that `package.json` remains the authoritative version source.
- Every roadmap implementation/closeout prompt carries the minimum model/effort rating established by the `BOOT.md` prompt workflow. Treat it as a minimum recommendation: a stronger rating/model may be used, and the recorded rating must not be silently removed or lowered when a task is revised.
- Make a concrete recommendation when asked for the recommended option.
- Never invent repository state, test results, Source behavior, or history.

## Pre-production compatibility rule

Use one canonical design. Do not add old/new aliases, synchronized duplicate fields, fallback compatibility paths, or speculative migration bridges unless a task explicitly requires a one-time migration.

## Repository identity

`the repo` / `the source code` = `jfin602/news-scraper`.
