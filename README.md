# News Scraper

Reusable, topic-independent news aggregation Platform for collecting Article metadata from administrator-approved Sources, normalizing it, preserving Source/run provenance, suppressing true duplicates, and publishing a rolling headline feed that sends readers to original publishers.

Each deployed installation hosts exactly one Publication/topic. The first deployment focuses on publishing-industry news relevant to indie authors. That topic is configuration, not shared Platform logic. A different topic reuses the same codebase through a separately configured deployment rather than being added as another live Publication in the same installation.

Publication is the singleton editorial/configuration concept for the installed news product, but it is **not** a relational tenancy key. The canonical code/data model does not use Publication IDs/slugs/foreign-key scoping merely to support hypothetical concurrent topics.

## Current project state

Current phase: **Phase 21 — Codebase simplification and maintainability hardening**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend implementation and closeout validation are complete. Phase 9 Basic public-feed UI and tech demo is complete by explicit repository-owner acceptance on August 11, 2026. Its durable validation artifact remains authoritative that the required two-Source Level 7 live-source gate was not observed in the recorded run because The Creative Penn timed out under the recorded execution environment; that accepted limitation is not rewritten as passing evidence.

The Phase 10 entry singleton implementation correction is complete with durable validation in `docs/validation/single-publication-simplification-correction.md`. It removed obsolete Publication tenancy/selector plumbing and established the canonical singleton migration-from-zero model, root `/` page, and `/api/feed` API without rewriting historical validation evidence.

Phase 10 — Automated polling, durable jobs, and endpoint health — is complete with durable validation in `docs/validation/phase-10-automated-polling-durable-jobs-endpoint-health.md`. The proven endpoint execution unit now runs behind durable jobs, due-endpoint scheduling, bounded retry/recovery behavior, conditional-fetch state persistence, cross-process capacity/locking controls, and baseline endpoint health without creating a second collection path or multi-Publication scheduler.

Phase 11 — Categories and configurable Relevance execution — is complete with durable validation in `docs/validation/phase-11-categories-configurable-relevance-execution.md`. It extended the existing Relevance boundary with persisted installation-wide Categories and deterministic configurable include/exclude/categorize rules while preserving topic independence, Source-scoped Article identity, provenance, and prospective-by-default rule edits.

Phase 12 — Feed discovery features — is complete with durable validation in `docs/validation/phase-12-feed-discovery-features.md`. It extended the canonical public-feed boundary with deterministic Source/Category filters, bounded literal keyword search, stable keyset pagination/load-more, URL/reset navigation behavior, and MVP-scale query/index tuning without changing feed eligibility or chronological ordering.

Phase 13 — Public presentation polish — is complete with durable validation in `docs/validation/phase-13-public-presentation-polish.md`. Minimum singleton Publication branding/read-model support, responsive desktop/mobile presentation, system/light/dark behavior, accessibility, intentional loading presentation, and preserved Phase 12 discovery semantics now form the integrated public baseline.

Phase 14 — Source administration — is complete by explicit repository-owner acceptance on August 14, 2026. Its historical validation artifact retains its original BLOCKED/RED determination: the then-required Level 8 Cloudflare Access/direct-origin deployment observation was unavailable, despite the recorded local/static/unit/integration/database/fixture/browser evidence. The governing roadmap and testing contract moved that deployment proof to Phase 19; acceptance did not rewrite the artifact or claim Level 8 was observed.

Phase 15 — Publication and Relevance administration — is complete with durable validation in `docs/validation/phase-15-publication-relevance-administration.md`. Phase 16 — True duplicate detection and grouping — is complete with durable validation in `docs/validation/phase-16-true-duplicate-detection-and-grouping.md`. Phase 17 — Article and duplicate moderation — is complete with durable GREEN validation in `docs/validation/phase-17-article-and-duplicate-moderation.md`. Phase 18 — Configurable HTML collection — is complete with durable GREEN validation in `docs/validation/phase-18-configurable-html-collection.md`; its bounded static HTML behavior uses the shared pipeline, keeps Source admission phrases RSS/Atom-only, and adds no browser collection. Phase 19 — Reliability, observability, and production operations — is complete with durable GREEN validation in `docs/validation/phase-19-reliability-observability-production-operations.md`, including the deferred Level 8 Cloudflare Access/direct-origin deployment-perimeter proof. Phase 20 — Customer launch validation — is complete and accepted with durable evidence in `docs/validation/phase-20-customer-launch-validation.md`, which establishes the first supported production baseline. Phase 21 is current and performs behavior-preserving engineering work under post-launch production compatibility.

## Delivery priority

Phases 1–9 are the tech-demo critical path.

The first demonstrable milestone is reached when at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public rolling feed with headlines linking to original publishers.

The later administration phases completed the protected singleton control plane after that vertical slice.

## MVP objective

Prove both:

1. The initial indie-author Publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured and deployed from the same codebase without changing aggregation-engine business logic.

The MVP does **not** require one installation to concurrently host multiple topic Publications or to preserve dormant relational tenant machinery for that hypothetical future.

## Public feed

Canonical public page:

```text
GET /
```

Canonical basic feed API:

```text
GET /api/feed
```

Core desktop concept:

```text
Date | Headline | Source
```

Completed MVP adds:

- reverse-chronological eligibility for visible ungrouped Articles and visible Primary Articles when singleton Publication `public_status = public` and the owning Source is approved/active;
- stored Article `original_url` destination links;
- clear Source identity;
- accessible stacked mobile layout;
- Category/Source filtering and keyword search;
- deterministic pagination/load-more;
- light/dark presentation.

The accepted Phase 8/9 validation artifacts record the slug-addressed implementation that existed at their accepted source SHAs. Those artifacts remain historical evidence; the completed singleton correction established the canonical selector-free routes.

Pinning/featured-story ordering is deferred beyond MVP.

## Locked project laws

See `docs/contracts/project-contract.md`.

1. Shared aggregation-engine code remains topic independent.
2. Every collected Article originates from an administrator-approved Source.
3. Structured feeds are preferred over HTML scraping.
4. Original Article URL remains the primary public destination.
5. Source-specific data is normalized before public-feed use.
6. Repeated collection is idempotent.
7. True duplicates suppress redundant public rows without deleting Source instances/provenance.
8. Categories, Relevance rules, branding, and Sources belong to Publication configuration.
9. Source failures are isolated.
10. Near-real-time means configurable polling unless a Source explicitly supports push; push adapters are deferred beyond MVP unless promoted.
11. Each deployed installation hosts exactly one Publication/topic; `/` is its canonical public feed surface, and different topics reuse the codebase through separate configured deployments.

## Canonical state and relationship model

The contracts deliberately separate:

- singleton Publication collection/public configuration;
- approval/trust state;
- configuration lifecycle state;
- operational collection state;
- Article moderation visibility;
- duplicate-group role;
- derived endpoint health.

An approved Source can therefore be paused without becoming “unhealthy,” and a hidden Article can remain a member of a Duplicate group without duplicate membership forcing it visible again. Collection operational state does not itself hide retained feed-eligible Articles.

The relational model keeps only meaningful relationships:

```text
singleton Publication settings

Source
  ├── Source endpoint
  │     └── Collection run
  └── Article
        └── Article observation (with endpoint/run provenance)
```

Source `config_key` is installation-wide. Endpoint identity remains Source-scoped. Article identity remains Source-scoped. Categories/Relevance/duplicate state are installation-wide with Source scope where explicitly required; they do not need a Publication tenant foreign key.

Phase 11 Categories and Relevance rules use immutable installation-wide configuration keys. The MVP Relevance predicate vocabulary is deliberately bounded to literal `title_contains`, `summary_contains`, and `source_category_equals` matching. Include/exclude precedence is deterministic by priority, Source scope, exclude-over-include, and final rule-config-key tie-break. All matching categorize rules apply; endpoint/Source defaults are fallback-only when no categorize rule assigns a Category.

## Collection architecture

```text
Cloudflare Access-protected Admin UI/API       Root Public Feed
                    \                           /
                     -------- Web/API ----------
                              |
                          PostgreSQL
                              |
                  durable jobs/scheduler
                              |
                           Worker
                              |
       eligibility + run lock + network safety
                              |
             Fetcher -> approved endpoint
                              |
           endpoint-selected Parser -> Raw item
                    /                     \
       RSS/Atom-only admission             HTML bypass
                    \                     /
            Normalizer -> Article candidate
                              |
             Article-link policy validation
                              |
       installation/Source Relevance + Categories
                              |
          Source-scoped Article identity + persistence
                              |
               Article observation provenance
                              |
          duplicate review/grouping when built
                              |
             public-feed read model -> publisher
```

During Phases 5–9 the Worker was invoked manually for configured endpoints. Phase 10 placed that same proven endpoint execution unit behind durable jobs/scheduling; Web/API never performs Source collection inline.

The scheduler operates directly on due endpoints when singleton Publication collection is active. There is no supported requirement to schedule or switch among multiple topic Publications inside one deployment.

Minimal Collection runs begin with the first real fetch in Phase 5. Phase 14 adds optional Source-owned RSS/Atom item admission between RSS/Atom parsing and normalization; absence preserves collect-all behavior, and mismatches are counted separately without becoming Relevance exclusions or Article observations. Phase 18 HTML Raw items bypass that RSS/Atom-only stage and rejoin at the same normalizer. Before configurable Relevance rules exist, safe candidates pass through the canonical empty-rule/default-include decision before identity. Phase 11 extends that same boundary rather than introducing a parallel relevance path.

## Identity versus duplicates

- **Article identity:** have we already stored this Source instance? Solved transactionally using reliable Source external IDs and canonical-URL fallback **within the same Source**.
- **True duplicate identity:** do two separately stored Articles represent the same underlying published item? Added in Phase 16.

Weak duplicate evidence becomes a persisted review candidate rather than silently hiding an Article.

## Administration

Initial singleton Publication/Source configuration may be supplied through idempotent operator-maintained bootstrap data. Bootstrap approval is explicit operator approval and never bypasses whitelist/state/network-safety rules. Ordinary bootstrap remains create-if-absent; the pre-admin public-feed work therefore uses explicit generic operator transitions where mutable persisted state must be changed rather than making bootstrap overwrite persisted configuration.

Phase 11 provides the smallest explicit topic-independent pre-admin operator mechanism for Categories, Relevance rules, and Source/endpoint default Category references. It is invoked deliberately, never on ordinary Web/Worker startup, validates real Source/Category relationships, and does not weaken ordinary bootstrap or trigger automatic bulk historical Relevance reprocessing.

Bootstrap/runtime selection does not use a Publication slug. Phase 14 owns MVP Source administration, including Source-owned optional RSS/Atom admission phrases with collect-all behavior when absent. Admin navigation/configuration operates on the installation's one configured news product rather than a multi-Publication selector.

MVP admin UI/API routes:

- are protected by Cloudflare Access;
- require supported deployment/origin configuration that prevents direct-origin bypass;
- use CSRF or equivalent request-integrity controls for state-changing browser actions;
- validate real Source/endpoint/run/Article/observation/duplicate relationships and domain invariants in application commands.

Native application-managed administrator accounts, sessions, roles, account recovery, per-user Publication authorization, and identity-linked audit attribution are deferred beyond MVP.

## Production data lifecycle

Before customer launch, the existing pre-production reset policy remains intentional: superseded development/pre-production databases may be rebuilt from the current canonical migration chain instead of carrying unsupported compatibility machinery.

Phase 19 established and validated production backup/restore, deployment/rollback, and schema-upgrade procedures. Acceptance of Phase 20 customer launch establishes the first supported production source/version/schema baseline. From that point forward:

- customer production data and governed relationships are durable supported state;
- normal upgrades/refactors preserve that state;
- supported production migration history remains capable of upgrading supported deployed state;
- clean migration-from-zero remains required for new/disposable installations but does not alone prove production upgrade safety;
- destructive customer-data reset is not an ordinary cleanup/refactor option.

`docs/decisions/production-data-and-schema-compatibility.md` is the detailed authority.

## Testing and regression policy

`docs/contracts/testing-and-validation-contract.md` is the project-wide testing authority.

Core rules:

- automated behavioral regression coverage is the primary defense against regressions;
- every implementation change requires focused tests plus relevant broader regression coverage for its blast radius;
- validation evidence applies to the exact final source tree tested;
- source inspection is not runtime proof and browser/database/live-Source claims require the corresponding evidence level;
- persistence/migration guarantees use real disposable PostgreSQL where practical from Phase 2 onward;
- ordinary deterministic local regression validation does not depend on live public publishers;
- collection behavior is tested with controlled fixtures/servers without weakening production whitelist/SSRF policy;
- explicitly invoked required suites fail clearly when prerequisites are missing and cannot silently skip green;
- flaky/skipped tests do not satisfy exit gates;
- implementation-roadmap phase closeout uses executed local terminal evidence and a durable `docs/validation/` record tied to the exact accepted commit/source tree.

Every implementation roadmap phase and gating correction inherits that contract even when its roadmap entry does not repeat the complete test matrix.

The completed Phase 10 entry singleton correction required real PostgreSQL migration-from-zero proof for the canonical singleton schema, structural proof that legacy-only migration/compatibility/test/config artifacts were gone, Source-scoped identity/integrity regressions, unchanged collection safety/accounting, canonical `/api/feed` behavior, and Level 6 browser validation of `/`. Its durable artifact remains evidence for the accepted corrected tree.

Phase 11 closeout additionally required deterministic proof of literal predicate/missing-field behavior, the complete include/exclude precedence/tie matrix, all-matching categorize/default fallback semantics, stable reason ordering, exact `excluded` accounting before identity, prospective non-retroactive behavior, and real PostgreSQL proof for Category/rule schema, uniqueness, relationships, memberships, and reason persistence.

Phase 12 closeout proved search/filter parameter validation, unchanged feed eligibility, Source/Category filtering, literal keyword search, stable keyset pagination, cursor/query consistency, URL/reset/back-forward navigation, load-more behavior, and the indexes/query shape needed for MVP-scale discovery across the required API/database/browser regression evidence.

After the Phase 20 production baseline, schema/persisted-representation changes additionally require supported upgrade/data-preservation evidence from the accepted baseline; migration-from-zero alone is insufficient. Phase 21 refactor/optimization claims also require the applicable full blast-radius regression evidence, and performance/resource improvements require materially comparable before/after measurements.

Dependency installation intentionally uses `package.json` without an npm package lock. Repository npm configuration disables `package-lock.json` generation, so clean installs use `npm install` rather than `npm ci`. Because declared dependency ranges may resolve to different compatible versions over time, validation applies to the exact source tree and recorded Node/npm environment that was actually tested rather than claiming byte-for-byte dependency reproducibility.

Database tests are intentionally separate from the ordinary deterministic suite. A root `.env` file is an optional, local, ignored configuration source that must not be committed. `npm run test:db`, `npm run test:live-sources`, `npm run db:migrate`, `npm run db:bootstrap`, `npm run collect:endpoint`, `npm run start:web`, and `npm run start:worker` load it when it exists; explicit environment variables take precedence. The ordinary `npm test`, unit, integration, and `check` commands do not automatically load `.env`.

Set `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` to a dedicated test-capable PostgreSQL administrative connection and run `npm run test:db`. The command creates and removes uniquely named disposable databases, including forced cleanup of ordinary leaked connections, and fails when the prerequisite is absent. This privileged test role must be able to create databases and terminate ordinary disposable-database connections. A PostgreSQL administrator should provision a dedicated non-production role with `CREATEDB` and `pg_signal_backend`, for example:

```sql
ALTER ROLE <test-role> CREATEDB;
GRANT pg_signal_backend TO <test-role>;
```

News Scraper never grants these privileges. `SUPERUSER` is neither required nor recommended. Never point this variable at a development or production application database.

For an application or development database, set `NEWS_SCRAPER_DATABASE_URL` to its PostgreSQL connection URL and run `npm run db:migrate` explicitly. Web/API and Worker startup do not apply migrations, including when started with values from `.env`. The application URL is separate from `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL`; the latter is privileged test administration used by database-backed validation commands such as `npm run test:db` and `npm run test:live-sources` and must never point at ordinary development or production application data.

## Security and reliability

Baseline controls are implemented with the surfaces they protect, not postponed to production hardening:

- SSRF-resistant validation before every request/redirect;
- response/decompression limits and timeouts;
- untrusted-content sanitization/escaping;
- Source/endpoint run isolation;
- transactionally idempotent Source-scoped Article identity;
- secret-safe structured logs and truthful Collection-run telemetry;
- Cloudflare Access/origin/request-integrity controls when admin surfaces arrive;
- focused and regression testing for contract-critical security/reliability behavior as each capability is introduced.

Phase 19 hardened and operationalized these controls with dashboards, alerts, restore testing, abuse regression tests, retention jobs, deployment/rollback/schema-upgrade validation, runbooks, and Level 8 reference-deployment proof.

## Documentation map

Start with `BOOT.md`.

```text
docs/
├── contracts/
│   ├── project-contract.md
│   ├── mvp-scope-and-users.md
│   ├── domain-and-data-contract.md
│   ├── source-and-collection-contract.md
│   ├── article-lifecycle-and-deduplication.md
│   ├── public-feed-and-admin-contract.md
│   └── testing-and-validation-contract.md
├── architecture/
│   └── system-architecture.md
├── operations/
│   ├── security-reliability-and-operations.md
│   ├── database-backup-and-restore.md
│   └── deployment-and-incident-runbook.md
├── roadmap/
│   └── mvp-roadmap.md
├── design/
│   ├── README.md
│   ├── ui-workflow.md
│   └── tasks/            # targeted non-versioned UI prompts when present
└── decisions/
    ├── single-publication-simplified-data-model.md
    ├── production-data-and-schema-compatibility.md
    ├── topic-independent-publication-model.md  # historical superseded ADR
    ├── whitelist-and-structured-feed-first.md
    ├── original-link-and-normalized-metadata.md
    └── cloudflare-access-admin-perimeter.md
```

`docs/README.md` is the documentation index. `AGENTS.md` is the compact project-law summary. Detailed behavior belongs to specialized documents.

## Repository workflow

Normal non-terminal phase handoff after a roadmap phase has formally closed:

```text
/closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

For a non-terminal phase, `/closeout` performs a quick structural/evidence check and, only when green, advances `package.json` to the next `0.<phase>.0` baseline. For terminal Phase 21, `/closeout` performs the same bounded verification but does not change `package.json`, create a successor phase, or reserve a new version baseline; it reports `Roadmap status: COMPLETE` with the accepted final SHA/version. A correction stack's final manual closeout remains different: it validates/clears only the correction and does not advance roadmap phase or package version.

Documentation review/application:

```text
/docs-review
→ explicit approval
→ /docs-apply

/docs-review
→ explicit approval
→ npm run docs:snapshot
→ /docs-prompt + news-scraper-docs-context.zip
→ Codex applies locally
```

`/docs-prompt` is the snapshot-based alternative after `/docs-review` approval: run `npm run docs:snapshot`, provide `news-scraper-docs-context.zip`, then use `/docs-prompt` to generate one Codex prompt for local application. `/docs-apply` remains the direct repository-editing path. `BOOT.md` defines the canonical contract. Invoking `/docs-apply` after the review constitutes approval of the reviewed change set unless the user explicitly narrows it.

Implementation prompt workflow for both roadmap phases and correction stacks:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Two task-folder modes are supported by the workflow contract:

```text
# Versioned roadmap phase stack
docs/tasks/p12/

# Non-versioned correction stack
docs/tasks/c10-single-publication/
```

Roadmap phase stacks use `TASK: Phase <phase> / P<number> — <title>` plus `0.<phase>.<prompt>` assigned-version metadata. Correction stacks use `TASK: Correction <phase> / P<number> — <title>` plus one required-unchanged-package-version value shared by every prompt in the stack. Correction P-numbers are local sequencing only and do not consume roadmap patch numbers.

Before starting automation, validate the exact written folder without launching Codex:

```text
npm run codex:phase:validate -- p12
npm run codex:phase:validate -- c10-single-publication
```

A valid folder has contiguous `P1...Pn` `.txt` prompts, exact supported recommendation labels, exactly one final manual closeout whose filename and TASK title both contain `closeout`, and the version metadata required by its stack type. Free-form body prose does not determine closeout kind or stack mode. The complete grammar is authoritative in `BOOT.md` and executable in `scripts/codex-phase-core.mjs`.

After validation, run implementation prompts automatically with:

```text
npm run codex:phase -- p12
npm run codex:phase -- c10-single-publication
```

For roadmap phase stacks, the runner validates the normal package-version chain and uses version commit subjects. For correction stacks, it validates that the declared package version remains unchanged before/after every prompt and uses correction-specific commit subjects. Both modes require clean working-tree boundaries, commit each successful implementation prompt independently, and stop before the final closeout prompt so closeout remains manual.

The correction stack's final manual closeout is **not** followed by `/closeout` merely because it is named closeout. Once that correction is green, work resumes in the already-active roadmap phase using the normal prompt pipeline.

Parallel presentation work uses the separate `ui-polish` branch/worktree and `docs/design/ui-workflow.md`. The normal targeted path is `/ui-plan <task>` → `/ui-write <slug>`. When durable design guidance is missing, contradictory, materially ambiguous, or must change, `/ui-plan` blocks and requires `/ui-review <area>` → explicit approval → `/ui-apply` → rerun `/ui-plan` before `/ui-write`. UI work is non-versioned and is not a `codex:phase` stack.

`BOOT.md` defines exact workflow gates, source-of-truth routing, validation expectations, stack grammar, UI-workstream boundaries, versioning behavior, and repository modification rules.

## Roadmap

See `docs/roadmap/mvp-roadmap.md` for full deliverables/dependencies/non-goals/exit gates.

Tech-demo critical path:

1. Phase 1 — Application foundation
2. Phase 2 — Database foundation
3. Phase 3 — Publication and Source configuration core
4. Phase 4 — Collection eligibility and network safety
5. Phase 5 — RSS/Atom transport, parsing, and minimal Collection runs
6. Phase 6 — Article normalization
7. Phase 7 — Default Relevance, Article identity, and persistence
8. Phase 8 — Basic public-feed backend
9. Phase 9 — Basic public-feed UI and tech demo

Completed after the tech-demo milestone:

- **Phase 10 entry correction — singleton implementation alignment** — complete with durable correction validation.
- **Phase 10 — Automated polling, durable jobs, and endpoint health** — complete with durable phase validation.
- **Phase 11 — Categories and configurable Relevance execution** — complete with durable phase validation.
- **Phase 12 — Feed discovery features** — complete with durable phase validation.
- **Phase 13 — Public presentation polish** — complete with durable phase validation.
- **Phase 14 — Source administration** — complete by explicit repository-owner acceptance on August 14, 2026; its historical BLOCKED/RED Level 8 deployment-proof artifact remains unchanged, and Phase 19 later supplied the deferred deployment observation.
- **Phase 15 — Publication and Relevance administration** — complete with durable phase validation.
- **Phase 16 — True duplicate detection and grouping** — complete with durable GREEN phase validation.
- **Phase 17 — Article and duplicate moderation** — complete with durable GREEN phase validation.
- **Phase 18 — Configurable HTML collection** — complete with durable GREEN phase validation.
- **Phase 19 — Reliability, observability, and production operations** — complete with durable GREEN phase validation.

Current:

- **Phase 21 — Codebase simplification and maintainability hardening**

Phase 20 acceptance established the first supported production baseline and began the feature freeze. Phase 21 is behavior-preserving final-tree simplification/optimization derived from the launched implementation and measured evidence. New product features remain frozen until it closes except for appropriately bounded critical production/security/data-integrity/operations fixes. Phase 21 is terminal unless the repository owner later approves an explicit roadmap extension.

Deferred after Phase 21: native administrator identity/accounts, historical Relevance bulk reprocessing, push/webhook adapters, AI summaries, related-story clustering, public personalization, outbound publishing, self-service tenancy, generic relevance ranking/boost scoring, pinning/featured ordering, API access, multilingual feeds. Concurrent multi-Publication hosting inside one installation is not deferred-by-default behavior; it would require an explicit future contract/ADR and deliberate data-model work. Deferred ideas do not reserve or imply Phase 22.

## Repository

`jfin602/news-scraper` — default branch `main`.
