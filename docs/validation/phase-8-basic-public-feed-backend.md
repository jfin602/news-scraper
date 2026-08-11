# Phase 8 — Basic public-feed backend validation

## Determination

**PHASE 8 GREEN — ACCEPTED**

The exact Phase 8 executable candidate satisfies every Phase 8 roadmap exit gate at the required evidence levels. Real disposable PostgreSQL evidence covers migrations, durable Article visibility, Publication exposure authority, feed eligibility/order/bounds, safe output, and the persisted database-to-production-HTTP vertical path. No executable Phase 8 defect was found during P5.

## Candidate identity and environment

- Branch: `main`.
- Accepted executable candidate SHA: `1721845cb200045b54ee2a4ab7308f52974ddbaf`.
- Actual P1 parent / implementation-range base: `abbb6101616e63077ff4d4905a68e3d69649179a`.
- Validated committed range: `abbb6101616e63077ff4d4905a68e3d69649179a...1721845cb200045b54ee2a4ab7308f52974ddbaf`.
- Package version: `0.8.5`.
- Validation date: 2026-08-10, CDT (UTC-05:00).
- Platform: Microsoft Windows NT `10.0.22631.0`.
- Node.js: `v24.11.1`; npm: `11.6.2`.
- PostgreSQL client: `18.3`; PostgreSQL server used by the disposable database tests: `18.3`.
- Safe database prerequisite: `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` was loaded from the root `.env` by the established test command; its value is not recorded.
- `npm install`: completed successfully; 189 packages audited, 0 vulnerabilities. This is not a byte-for-byte dependency reproducibility claim.
- No `package-lock.json` or `npm-shrinkwrap.json` was generated or present.

## Executed final-tree validation

All executable commands ran after candidate commit `1721845cb200045b54ee2a4ab7308f52974ddbaf` was established. No executable file changed afterward.

| Evidence | Command/procedure | Observed result |
| --- | --- | --- |
| Level 1 | `npm run format:check` | Passed; all matched files use Prettier formatting. |
| Level 1 | `npm run lint` | Passed. |
| Level 1 | `npm run typecheck` | Passed. |
| Level 2 | `npm run test:unit` | 175/175 passed; 0 failed, 0 skipped. |
| Level 3 | `npm run test:integration` | 44/44 passed; 0 failed, 0 skipped. |
| Level 5 | `npm run test:collection` | 38/38 passed; 0 failed, 0 skipped. |
| Level 4 | `npm run test:db` | 72/72 passed against real disposable PostgreSQL; 0 failed, 0 skipped; cleanup verified by the established harness. |
| Levels 2/3/5 | `npm test` | 257/257 passed; 0 failed, 0 skipped. |
| Levels 1/2/3/5 | `npm run check` | Passed format, lint, typecheck, and 257/257 ordinary tests; 0 skipped. |
| Level 1 | `git diff --check abbb6101616e63077ff4d4905a68e3d69649179a...1721845cb200045b54ee2a4ab7308f52974ddbaf` | Passed with no whitespace errors. |

Every required suite selected substantive tests, used no automatic retry as acceptance evidence, and did not silently skip its database prerequisite.

## Phase 8 behavior evidence

### Article visibility and migration — Level 4

`test/database/article-schema.test.ts`, `test/database/article-persistence.test.ts`, and `test/database/migrations.test.ts` prove that production migrations from zero include additive migration `0006_article_visibility.sql`; representative Phase 7 history upgrades to `visible`; new Articles map to the `visible` baseline; PostgreSQL accepts exactly `visible`, `hidden`, and `archived`; and later unchanged or material Source observations preserve hidden/archived state while retaining truthful `unchanged`/`updated` outcomes, Article cardinality, identity, and observation provenance. Migration reruns have no repeated effect. Only new migration `0006` occurs in the Phase 8 range; no earlier migration checksum was rewritten.

### Publication exposure authority — Levels 3 and 4

`test/database/publication-public-status.test.ts`, `test/database/configuration-bootstrap.test.ts`, and `test/database/initial-publication-bootstrap.test.ts` exercise the production repository and actual local command in both `private -> public` and `public -> private` directions. They prove exact-target mutation, bounded invalid/missing/database failures, no unrelated creation or mutation, fresh intended public bootstrap state, and ordinary bootstrap preservation of later operator-managed state. Secret-like connection detail is absent from command errors.

### Feed eligibility, date, order, and bounds — Level 4

`test/database/public-feed-repository.test.ts` proves that the requested Publication must be public; Sources must be approved and active; Articles must be visible; and rows cannot bleed across Publications. It also proves that Publication collection inactivity, Source paused/disabled operational state, endpoint lifecycle/operational/health state, and failed/latest Collection runs do not suppress retained otherwise-eligible Articles.

The same matrix proves parsed `published_at` use with `first_seen_at` fallback and an explicit `published_at`/`first_seen_at` date-source branch; canonical effective-date DESC, first-seen DESC, Article-id ASC ordering; deterministic repeated reads; exactly the newest 100 of 101+ eligible rows; and a public zero-row result containing Publication identity plus empty items. No duplicate-group or role persistence was introduced.

### Safe read model and original destination — Level 4

`test/database/public-feed-repository.test.ts` proves the returned row contains only stable Article id, effective date/source, `display_title` headline, Source display name, and stored `original_url`. A deliberately different `canonical_identity_url` is not substituted. Normalized title, identity URL/digest, external id, summary/content, and observation/run/endpoint identifiers are not exposed. Production query inspection confirms eligibility joins only Publication, Article, and Source and does not gate on Publication collection activity, Source operational state, endpoints, or Collection runs.

### HTTP contract and process boundaries — Levels 3 and 4

`test/integration/public-feed-http.test.ts` proves exact minimal success JSON with ISO timestamps, public empty `200`, canonical `404` for an undefined reader result, indistinguishable private/missing route behavior, and bounded redacted `503` failures. Existing health tests remain green.

`test/database/public-feed-http.test.ts` uses an actually migrated disposable PostgreSQL database, production reader, Express listener, and real local HTTP request. It returns the persisted eligible Article with matching headline, Source, date branch, and original destination; public empty returns `200`; private and missing return the same `404` contract.

`test/integration/web-process.test.ts` and `test/integration/web-health.test.ts` prove an unavailable database still permits Web liveness, readiness and feed dependency failures remain bounded `503` responses without secret leakage, and shutdown remains clean. Source fetching/parsing/collection remains Worker-owned; Web production wiring only invokes the public-feed reader.

### Preserved upstream behavior

The complete unit, integration, collection, database, ordinary, and `check` suites preserve Publication/Source configuration and bootstrap, Article identity/idempotency/observations, Worker collection and network-safety boundaries, controlled collection fixtures, and process health/readiness. The real migration suite also preserves representative Article/observation/configuration history through the Phase 7-to-Phase 8 upgrade.

## Scope inspection

The actual P1-parent-to-candidate changed-file set was inspected. It contains the additive visibility migration and repository mapping, narrow Publication public-status repository/command/configuration, bounded public-feed read model and HTTP wiring, focused regression tests, and the P5 version transition. It contains no npm lock metadata, Phase 9 HTML/UI/browser presentation, search/filter/client pagination, duplicate groups or Primary roles, Article moderation, full admin API/UI or native accounts, scheduler/jobs, HTML collection adapter, Web/API Source fetching, or topic-specific engine conditionals.

## Exit-gate mapping

1. Durable canonical Article visibility and existing/new visible baseline: **green**, Level 4.
2. Non-visible state survives later Source observations without corrupting material-change semantics: **green**, Level 4.
3. Explicit Publication `private <-> public` authority with bootstrap no-overwrite: **green**, Levels 3 and 4.
4. Public Publication + approved active Source + visible Article eligibility and Publication isolation: **green**, Level 4.
5. Collection/operational/endpoint/run state is not an accidental historical suppression gate: **green**, Level 4.
6. Canonical effective-date branch, source marker, deterministic order, and 100-row bound: **green**, Level 4.
7. Safe minimal fields use display title, Source display name, and stored original URL: **green**, Level 4.
8. Public empty `200`, indistinguishable missing/private `404`, and bounded secret-safe `503`: **green**, Levels 3 and 4.
9. Real persisted PostgreSQL Article through production Web/API HTTP: **green**, Level 4.
10. Web/API remains read-only for collection and process health/failure boundaries remain intact: **green**, Level 3 plus regression inspection.

## Limitations and next phase

No live public Source run was required or executed. No browser evidence was required because Phase 8 exposes a JSON backend only. No deployment/reference-environment, Phase 9 presentation, search/filter/pagination, duplicate grouping, moderation, scheduler, HTML collection, or production-readiness claim is made.

**The Phase 8 roadmap exit gate is satisfied. The next roadmap phase is Phase 9 — Basic public-feed UI and tech demo.** The later conversational `/closeout` command owns any accepted transition to the Phase 9 baseline `0.9.0`; this P5 artifact does not perform that handoff.
