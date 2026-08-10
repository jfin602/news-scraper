# Phase 7 — Default Relevance, Article identity, and persistence validation

## Determination

**PHASE 7 GREEN — ACCEPTED**

The exact Phase 7 executable candidate satisfies every Phase 7 roadmap exit gate at the required evidence levels. Real disposable PostgreSQL evidence covers identity, concurrency, provenance, atomicity, rollback, migrations, long identities, and integrated Worker persistence. Conversational `/closeout` is authorized, subject to its normal structural drift check.

## Candidate identity and environment

- Branch: `main`.
- Accepted implementation source SHA: `c05b0bb2a40bfd3b9844b51d825a4eb55988861d`.
- Package version: `0.7.6`.
- Candidate change in P6: only the authorized top-level `package.json` transition from `0.7.5` to `0.7.6`; no executable defect was found or repaired.
- Validation date: 2026-08-10, CDT (UTC-05:00).
- Platform: Microsoft Windows NT `10.0.22631.0`.
- Node.js: `v24.11.1`; npm: `11.6.2`.
- PostgreSQL client: `18.3`; PostgreSQL server used by the disposable database tests: `18.3`.
- Safe database prerequisite: `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` was loaded from the root `.env`; its value is not recorded.
- `npm install`: completed successfully; 189 packages audited, 0 vulnerabilities. This is not a byte-for-byte reproducibility claim.
- No `package-lock.json` or `npm-shrinkwrap.json` was generated or present.

## Executed final-tree validation

All commands ran after candidate commit `c05b0bb2a40bfd3b9844b51d825a4eb55988861d` was established. No executable file changed afterward.

| Evidence | Command/procedure | Observed result |
| --- | --- | --- |
| Level 1 | `npm run format:check` | Passed; all matched files use Prettier formatting. |
| Level 1 | `npm run lint` | Passed. |
| Level 1 | `npm run typecheck` | Passed. |
| Level 2 | `npm run test:unit` | 133/133 passed; 0 failed, 0 skipped. |
| Level 3 | `npm run test:integration` | 40/40 passed; 0 failed, 0 skipped. |
| Level 5 | `npm run test:collection` | 38/38 passed; 0 failed, 0 skipped. |
| Level 4 | `npm run test:db` | 57/57 passed against real disposable PostgreSQL; 0 failed, 0 skipped; cleanup verified. A second focused extraction rerun also passed 57/57. |
| Levels 2/3/5 | `npm test` | 211/211 passed; 0 failed, 0 skipped. |
| Levels 1/2/3/5 | `npm run check` | Passed format, lint, typecheck, and 211/211 ordinary tests; 0 skipped. |
| Level 1 | `git diff --check ad9a048200488ce774f757efd7c4584d59bffeaa..c05b0bb2a40bfd3b9844b51d825a4eb55988861d` | Passed with no whitespace errors across the committed Phase 7 baseline-to-candidate range. |

The required suites selected substantive tests, did not silently skip a database prerequisite, and used no automatic retry as acceptance evidence.

## Behavior evidence

### Relevance ordering and default include — Levels 2, 3, and 5

`test/unit/relevance-evaluator.test.ts` proves a deterministic, immutable, topic-independent `default_include` decision for unrelated Publication/Source data without ambient state. `test/integration/collect-endpoint.test.ts` records the canonical per-candidate order: Article-link policy, then Relevance, then Article persistence; rejected links never reach Relevance or identity. It also proves exact isolated outcomes and complete fatal-stage accounting. `test/collection/article-normalization-pipeline.test.ts` exercises the production stage order with controlled RSS, Atom, redirect, malformed-item, and link-policy fixtures. Production Phase 7 uses only default include, so integrated production-path evidence has `excluded_count = 0` and `rejected_count = article_link_rejection_count`.

### Strong, fallback, promotion, and conflict identity — Level 4

`test/database/article-persistence.test.ts` proves Source-scoped strong external-ID reuse; Source-derived URL/title/metadata updates without cardinality growth; separation across Sources; full stored-value comparison after digest lookup; canonical-only idempotency; exact canonical resolution to one strong Article; safe fallback-to-strong promotion; separation of different strong IDs sharing a canonical URL; conservative canonical-only ambiguity failure; and no normalized/fuzzy-title identity behavior. `test/database/article-schema.test.ts` proves the supporting partial digest indexes and full-value storage.

### Create, update, unchanged, and observation semantics — Level 4

The Article persistence database matrix proves first observation `created`, unchanged replay `unchanged`, material Source-derived change `updated`, observation/last-seen-only replay remaining `unchanged`, deterministic first/last-seen behavior, and distinct run observations without Article-cardinality growth.

### Racing uniqueness — Level 4

`transaction locks serialize same-identity and canonical-promotion races` uses independent database actors, advisory transaction locks, explicit lock-attempt barriers, backend wait inspection, and `Promise.all`; it does not depend on timing-only sleeps. It proves one Article for same strong-ID races, one fallback for same canonical-only races, one promoted logical Article for strong-versus-canonical races, and two Articles for different strong IDs sharing a canonical URL.

### Provenance, ownership, atomicity, and rollback — Level 4

Article schema/persistence tests prove every successful observation references its Article, Publication, Source, endpoint, and actual Collection run, with composite ownership constraints rejecting cross-owner combinations. Repeated observations retain separate run provenance. A database trigger-induced observation failure rolls back Article creation and material fallback promotion; identity conflicts create no successful observation. General transaction and migration rollback tests preserve database invariants.

### Candidate isolation and Collection-run accounting — Levels 3, 4, and 5

Integration and real-database collection tests prove an expected item identity conflict becomes `failed` while unrelated candidates commit. Fatal Relevance/clock/persistence-stage failures stop unsafe remaining work, preserve earlier committed Articles/observations, mark the current and remaining candidates failed, and finalize the run failed without a feed-batch-wide Article transaction. Finalization failure does not roll back committed Article work and releases the endpoint lock.

For every processing-attempted run, tests assert:

`created + updated + unchanged + rejected + excluded + failed = normalized_candidate_count`

Normalization failures remain outside that equation. Article-link rejections map to `rejected`; default production Relevance yields zero exclusions. Ordinary item failures may coexist with `processing_status = succeeded`; fatal stage failures produce failed processing and overall status with complete counts. Earlier transport/parser/normalization fatal and no-change paths retain `processing_status = not_run` with zero processing counters. Returned service state is compared field-for-field with persisted Collection-run state.

### Migrations and long identities — Level 4

The migration suite applies production migrations from zero in order and reruns without repeated effects. Representative `0003 -> 0004` and `0004 -> 0005` upgrades preserve historical configuration/runs and truthfully initialize historical processing as `not_run`; checksum tests reject modified or missing applied history. Schema constraints and identity indexes remain authoritative.

Near-limit high-entropy external IDs and canonical URLs persist in full, avoid B-tree entry-size failures through SHA-256 digest indexes, re-resolve through digest plus full equality, and do not silently merge distinct full values.

### Worker, security, and preserved upstream behavior — Levels 1, 3, and 5

Inspection and regressions confirm the Worker remains the sole collection owner; Web health/process code performs no Source fetch. Eligibility and endpoint locking precede network safety and transport, and every redirect is revalidated. Normalization and Article-link policy remain before Relevance/identity. Worker output tests exclude Raw bodies, summaries/full content, database credentials/URLs, SQL, stack traces, and unbounded remote errors. A failed endpoint attempt does not block a later independent endpoint execution.

The controlled collection suite uses injected local HTTP/RSS/Atom data and a deterministic Article-persistence fake to exercise canonical production ordering; it is Level 5 pipeline evidence, not a substitute for the Level 4 PostgreSQL matrix.

## Scope inspection

The committed baseline-to-candidate changed-file set was inspected. It contains the Phase 7 Relevance boundary, Article/observation migrations and repository, Collection-run processing accounting, Worker integration, tests, task/docs alignment, and repository phase-runner tooling. It contains no npm lockfile, Phase 8 feed/API/UI, configurable Relevance rule or Category persistence, duplicate grouping/moderation, scheduler/jobs, HTML collection, topic-specific engine logic, or speculative stable identity-key framework. Existing migration checksums were not rewritten.

## Roadmap exit-gate mapping

1. Every safe candidate passes Relevance before identity: **green**, Levels 3 and 5.
2. Empty-rule Relevance is deterministic default include: **green**, Levels 2, 3, and 5.
3. Unchanged Source-item replay does not increase Article cardinality: **green**, Level 4.
4. Concurrent identity attempts preserve uniqueness on real PostgreSQL: **green**, Level 4.
5. Every persisted observation traces to its actual endpoint/run with Publication/Source ownership: **green**, Level 4.
6. Identity resolution, Article create/update, and successful observation are atomic per candidate: **green**, Level 4.
7. Transaction failures preserve database invariants: **green**, Level 4.
8. Item failures do not erase unrelated successful Articles when isolation is safe: **green**, Levels 3 and 4.
9. Collection-run processing outcomes are exact and truthful: **green**, Levels 3, 4, and 5.

## Limitations and claims not made

No live public Source run was required or executed for P6. No browser, reference-deployment, Phase 8 public feed, configurable Relevance, duplicate-grouping, admin, scheduler, HTML-collection, or production-readiness evidence is claimed. The dependency installation is a normal lockfile-disabled npm install, not byte-identical dependency proof.

**Phase 7 roadmap exit gate is satisfied. Conversational `/closeout` may perform its normal structural drift check and, if green, transition the project to the Phase 8 baseline `0.8.0`.**
