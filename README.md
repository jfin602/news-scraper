# News Scraper

Reusable, topic-independent news aggregation Platform for collecting Article metadata from administrator-approved Sources, normalizing it, preserving Source/run provenance, suppressing true duplicates, and publishing rolling headline feeds that send readers to original publishers.

The first configured Publication focuses on publishing-industry news relevant to indie authors. That topic is configuration, not shared Platform logic.

## Current project state

Current phase: **Phase 9 — Basic public-feed UI and tech demo**.

Phase 0 documentation alignment, Phase 1 Application foundation, Phase 2 Database foundation, Phase 3 Publication and Source configuration, Phase 4 Collection eligibility and network safety, Phase 5 RSS/Atom transport, parsing, and minimal Collection runs, Phase 6 Article normalization, Phase 7 Default Relevance/Article identity/persistence, and Phase 8 Basic public-feed backend implementation and closeout validation are complete.

Phase 8 established persisted Article visibility, Publication/Source public-row eligibility gates, deterministic effective feed-date ordering, the bounded Publication-scoped `GET /api/publications/:publicationSlug/feed` endpoint, safe minimal output shaping, and stored Article `original_url` headline destinations. Phase 9 builds the first customer-visible page at `GET /publications/:publicationSlug`, reusing that canonical public-feed boundary rather than creating a parallel feed query path. The tech-demo page provides the core desktop `Date | Headline | Source` view, a sane stacked mobile view, Publication identity, original-publisher headline links, explicit loading/empty/error states, and deterministic UTC calendar-date rendering until later Publication presentation settings exist.

## Delivery priority

Phases 1–9 are the tech-demo critical path.

The first demonstrable milestone is reached when at least two real approved RSS/Atom Sources are collected through the Worker, recorded in Collection runs, normalized, passed through the canonical default-include Relevance boundary, persisted idempotently with Article-observation provenance, and displayed in the public rolling feed with headlines linking to original publishers.

Full admin UX follows after that vertical slice is working.

## MVP objective

Prove both:

1. The initial indie-author Publication is useful as a rolling industry-news feed.
2. A second unrelated topic can be configured without changing aggregation-engine business logic.

## Public feed

Core desktop concept:

```text
Date | Headline | Source
```

Completed MVP adds:

- reverse-chronological eligibility for visible ungrouped Articles and visible Primary Articles under a public Publication and approved active Source;
- stored Article `original_url` destination links;
- clear Source identity;
- accessible stacked mobile layout;
- Category/Source filtering and keyword search;
- deterministic pagination/load-more;
- light/dark presentation.

Phase 8 establishes the backend read model/API. Phase 9 builds the canonical basic Publication page over that same boundary and intentionally reaches a useful real-data tech demo before discovery/presentation polish is complete.

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

## Canonical state model

The contracts deliberately separate:

- approval/trust state;
- configuration lifecycle state;
- operational collection state;
- Publication public visibility;
- Article moderation visibility;
- duplicate-group role;
- derived endpoint health.

An approved Source can therefore be paused without becoming “unhealthy,” and a hidden Article can remain a member of a Duplicate group without duplicate membership forcing it visible again. Collection operational state does not itself hide retained feed-eligible Articles.

## Collection architecture

```text
Cloudflare Access-protected Admin UI/API       Public Feed
                    \                           /
                     -------- Web/API ----------
                              |
                          PostgreSQL
                              |
            durable jobs/scheduler (Phase 10+)
                              |
                           Worker
                              |
       eligibility + run lock + network safety
                              |
             Fetcher -> approved endpoint
                              |
                  Parser -> Raw item
                              |
            Normalizer -> Article candidate
                              |
             Article-link policy validation
                              |
            Publication Relevance/Categories
                              |
             Article identity + persistence
                              |
               Article observation provenance
                              |
          duplicate review/grouping when built
                              |
             public-feed read model -> publisher
```

During Phases 5–9 the Worker is invoked manually for configured endpoints. Phase 10 places the same proven endpoint execution unit behind durable jobs/scheduling; Web/API never performs Source collection inline.

Minimal Collection runs begin with the first real fetch in Phase 5. Before configurable Relevance rules exist, safe candidates pass through the canonical empty-rule/default-include decision before identity.

## Identity versus duplicates

- **Article identity:** have we already stored this Source instance? Solved transactionally in Phase 7 using reliable Source external IDs, canonical URLs, and constrained fallback evidence.
- **True duplicate identity:** do two separately stored Articles represent the same underlying published item? Added in Phase 16.

Weak duplicate evidence becomes a persisted review candidate rather than silently hiding an Article.

## Administration

Initial Publication/Source configuration may be supplied through idempotent operator-maintained bootstrap data. Bootstrap approval is explicit operator approval and never bypasses whitelist/state/network-safety rules. Ordinary bootstrap remains create-if-absent; Phase 8's pre-admin public-feed work therefore uses an explicit generic operator transition when an existing Publication's `public_status` must change rather than making bootstrap overwrite persisted state.

MVP Source admin UI begins in Phase 14, after the working public vertical slice.

MVP admin UI/API routes:

- are protected by Cloudflare Access;
- require supported deployment/origin configuration that prevents direct-origin bypass;
- use CSRF or equivalent request-integrity controls for state-changing browser actions;
- validate Publication/resource ownership in application commands.

Native application-managed administrator accounts, sessions, roles, account recovery, per-user Publication authorization, and identity-linked audit attribution are deferred beyond MVP.

## Testing and regression policy

`docs/contracts/testing-and-validation-contract.md` is the project-wide testing authority.

Core rules:

- automated behavioral regression coverage is the primary defense against regressions;
- every implementation change requires focused tests plus relevant broader regression coverage for its blast radius;
- validation evidence applies to the exact final source tree tested;
- source inspection is not runtime proof and browser/database/live-Source claims require the corresponding evidence level;
- persistence guarantees use real disposable PostgreSQL where practical from Phase 2 onward;
- ordinary deterministic local regression validation does not depend on live public publishers;
- collection behavior is tested with controlled fixtures/servers without weakening production whitelist/SSRF policy;
- explicitly invoked required suites fail clearly when prerequisites are missing and cannot silently skip green;
- flaky/skipped tests do not satisfy phase exit gates;
- implementation-roadmap phase closeout uses executed local terminal evidence and a durable `docs/validation/` record tied to the exact accepted commit/source tree.

Every implementation roadmap phase inherits that contract even when its phase entry does not repeat the complete test matrix. Phase 9 additionally requires Level 6 browser evidence for the public tech-demo flow and Level 7 evidence against the named approved live Sources required by its exit gate.

Dependency installation intentionally uses `package.json` without an npm package lock. Repository npm configuration disables `package-lock.json` generation, so clean installs use `npm install` rather than `npm ci`. Because declared dependency ranges may resolve to different compatible versions over time, validation applies to the exact source tree and recorded Node/npm environment that was actually tested rather than claiming byte-for-byte dependency reproducibility.

Database tests are intentionally separate from the ordinary deterministic suite. A
root `.env` file is an optional, local, ignored configuration source that must not be
committed. `npm run test:db`, `npm run test:live-sources`, `npm run db:migrate`,
`npm run db:bootstrap`, `npm run collect:endpoint`, `npm run start:web`, and
`npm run start:worker` load it when it exists; explicit environment variables take
precedence. The ordinary `npm test`, unit, integration, and `check` commands do not
automatically load `.env`.

Set `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` to a dedicated test-capable PostgreSQL
administrative connection and run `npm run test:db`. The command creates and removes
uniquely named disposable databases, including forced cleanup of ordinary leaked
connections, and fails when the prerequisite is absent. This privileged test role
must be able to create databases and terminate ordinary disposable-database
connections. A PostgreSQL administrator should provision a dedicated non-production
role with `CREATEDB` and `pg_signal_backend`, for example:

```sql
ALTER ROLE <test-role> CREATEDB;
GRANT pg_signal_backend TO <test-role>;
```

News Scraper never grants these privileges. `SUPERUSER` is neither required nor
recommended. Never point this variable at a development or production application
database.

For an application or development database, set `NEWS_SCRAPER_DATABASE_URL` to its
PostgreSQL connection URL and run `npm run db:migrate` explicitly. Web/API and Worker
startup do not apply migrations, including when started with values from `.env`. The
application URL is separate from
`NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL`; the latter is privileged test administration
used by database-backed validation commands such as `npm run test:db` and
`npm run test:live-sources` and must never point at ordinary development or
production application data.

## Security and reliability

Baseline controls are implemented with the surfaces they protect, not postponed to production hardening:

- SSRF-resistant validation before every request/redirect;
- response/decompression limits and timeouts;
- untrusted-content sanitization/escaping;
- Source/endpoint run isolation;
- transactionally idempotent Article identity;
- secret-safe structured logs and truthful Collection-run telemetry;
- Cloudflare Access/origin/request-integrity controls when admin surfaces arrive;
- focused and regression testing for contract-critical security/reliability behavior as each capability is introduced.

Phase 19 hardens/operationalizes these controls with dashboards, alerts, restore testing, abuse regression tests, retention jobs, deployment/rollback validation, and runbooks.

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
│   └── security-reliability-and-operations.md
├── roadmap/
│   └── mvp-roadmap.md
└── decisions/
    ├── topic-independent-publication-model.md
    ├── whitelist-and-structured-feed-first.md
    ├── original-link-and-normalized-metadata.md
    └── cloudflare-access-admin-perimeter.md
```

`docs/README.md` is the documentation index. `AGENTS.md` is the compact project-law summary. Detailed behavior belongs to specialized documents.

## Repository workflow

Phase handoff after a roadmap phase has formally closed:

```text
/closeout
→ /docs-review
→ /docs-apply
→ /prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

`/closeout` performs a quick structural/evidence check of the completed phase and, only when green, advances `package.json` to the next `0.<phase>.0` baseline. Its invocation authorizes that version-only transition; it does not rerun the full phase validation matrix. The following docs review/apply aligns roadmap and root phase-state summaries with that already-entered baseline.

Documentation review/application:

```text
/docs-review
→ explicit approval
→ /docs-apply
```

Invoking `/docs-apply` after the review constitutes approval of the reviewed change set unless the user explicitly narrows it.

Implementation prompt workflow:

```text
/prompt-ass
→ /prompt-plan
→ /prompt-write <folder name>
```

Phase prompt folders are machine-parsed. Before starting automation, validate the exact written folder without launching Codex:

```text
npm run codex:phase:validate -- p9
```

A valid folder has contiguous `P1...Pn` `.txt` prompts, exact supported recommendation labels and `0.<phase>.<prompt>` version metadata, and exactly one final manual closeout whose filename and `TASK:` title both contain `closeout`. Free-form body prose does not determine closeout kind. The complete grammar is authoritative in `BOOT.md` and executable in `scripts/codex-phase-core.mjs`.

After validation, run implementation prompts automatically with:

```text
npm run codex:phase -- p9
```

The runner executes implementation prompts in order, uses each prompt's parsed model/reasoning configuration, validates version/working-tree boundaries, commits each successful prompt, and stops before the final closeout prompt so that closeout remains manual.

`BOOT.md` defines exact workflow gates, source-of-truth routing, validation expectations, versioning behavior, phase-runner prompt grammar, and repository modification rules.

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

Then:

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

Deferred: native administrator identity/accounts, historical Relevance bulk reprocessing, push/webhook adapters, AI summaries, related-story clustering, public personalization, outbound publishing, self-service tenancy, generic ranking/boost scoring, pinning/featured ordering, API access, multilingual feeds.

## Repository

`jfin602/news-scraper` — default branch `main`.
