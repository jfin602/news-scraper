# Phase 11 Categories and Configurable Relevance Execution Validation

## Accepted source and environment

- Validation completed: 2026-08-12 at 17:52 CDT (`America/Chicago`).
- Accepted executable source SHA: `b465202e0095ee9a28e0aad52bc9f444e96dc0b9`.
- Package version: `0.11.7`.
- Platform: Windows x64, Windows 10.0.22631.
- Node.js: 24.11.1; npm: 11.6.2.
- PostgreSQL client and disposable-test server: 18.3.
- `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` was present through local `.env` and used by the disposable PostgreSQL global test setup. Its value is intentionally not recorded.

The accepted executable SHA is the clean committed P1-P7 executable tree before this evidence document was added. The documentation-only validation commit is not represented as runtime-tested executable source.

## Phase 11 delivered scope

P1 added installation-wide Category/Relevance schema and provenance constraints. P2 added transactional configuration repositories and deterministic snapshot loading. P3 added the bounded literal evaluator and precedence/default matrix. P4 added the explicit strict editorial configuration command and the committed initial Categories. P5 added atomic included/excluded observation, current Category membership, and historical reason persistence. P6 integrated one snapshot and evaluator into the canonical manual/scheduled endpoint service with exact accounting. P7 advanced only the package version, inspected the final implementation, and executed the closeout evidence below. No bounded implementation defect was found or fixed in P7.

## Exact final-tree command evidence

All required commands ran against executable SHA `b465202e0095ee9a28e0aad52bc9f444e96dc0b9`:

| Command | Observed result |
| --- | --- |
| `npm run format:check` | Passed; all matched files use Prettier formatting. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | 260 passed, 0 failed, 0 skipped. |
| `npm run test:integration` | 54 passed, 0 failed, 0 skipped. |
| `npm run test:collection` | 38 passed, 0 failed, 0 skipped. |
| `npm run test:db` | 129 passed, 0 failed, 0 skipped against real disposable PostgreSQL. |
| `npm test` | 352 passed, 0 failed, 0 skipped. |
| `npm run check` | Passed formatting, lint, type checking, and the 352-test deterministic aggregate with 0 failures and 0 skips. |

Every required filtered suite selected tests. No retry, flaky result, zero-selection result, or silent prerequisite skip was accepted. `package-lock.json` and `npm-shrinkwrap.json` remain absent.

The initially full C: drive prevented one npm invocation from starting; it was not a test failure. Disposable npm/cache and incomplete installer/download temporary data were moved to K:, and subsequent command temporary/cache output was redirected there. Every result in the table is from a later completed command with exit code zero.

## Deterministic evaluator and topic independence

Unit evidence covers exactly `title_contains`, `summary_contains`, and `source_category_equals`: title/summary literal contains, missing summary and Source Categories, case-insensitive comparison, exact Source-Category equality, and literal regex/glob-looking text. It proves priority descending, Source scope, exclude-before-include, config-key final tie, disabled-rule exclusion, and default include.

Categorization evidence proves all matching rules apply; duplicate targets deduplicate membership while retaining every reason; reason and Category ordering are stable; endpoint then Source defaults are fallback-only; endpoint wins; any categorization suppresses fallback; and an included Article may remain uncategorized when no rule/default applies. Identical frozen inputs produce deeply equal results without mutation or clock, randomness, environment, or locale dependence. An unrelated-topic vocabulary fixture uses identical mechanics, while the initial publishing Categories remain only explicit editorial configuration.

Source inspection found no `publication_id`/Publication tenant key in `src/` or the migration chain, no topic conditional in shared Relevance/collection code, and no regex, glob, fuzzy, stemming, semantic-AI, ranking, or boost engine. The migration predicate constraint, configuration parser, repository row parser, and evaluator switch all expose only the three governed predicates.

## Real PostgreSQL schema, editorial, and persistence evidence

The disposable PostgreSQL suite migrated the exact six-file canonical chain from zero, reran it safely, and retained migration-history checks. Database tests enforce installation-wide Category/rule config-key uniqueness and immutable identity; optional real Source scope; predicate/action/category-target constraints; Source/endpoint default Category references; Article/Category uniqueness; observation rule and ordered Category-reason integrity; and existing Source/endpoint/run/Article ownership. Pre-identity `excluded` observations permit a null Article ID, while identity-resolving success observations require the Article relationship.

Editorial tests cover strict command/document validation, unknown and duplicate identity/target rejection, initial create, idempotent repeat, mutable edits with stable config identity, explicit disable, Source/endpoint default set/replace/clear, all-request rollback on invalid relationships, omitted-state preservation, and unchanged Article/observation cardinality. The committed initial document contains nine first-deployment Categories with no rules or defaults. Application is an explicit operator command and is not called by ordinary Web or Worker startup; bootstrap remains create-if-absent/no-overwrite.

Included persistence tests prove Article create/update/unchanged, observation, current automatic membership, and all ordered historical reasons commit atomically. Category-only reconciliation remains `unchanged`, later inclusion replaces or clears stale current membership, multiple reasons may explain one membership, and injected observation/membership/reason failures roll back the candidate transaction. Existing external-ID, canonical fallback/promotion/conflict, Source-scope, rollback, and concurrency identity tests remain green.

The prospective sequence is proven in one real-PostgreSQL test: initial inclusion with Category A; later unchanged Source content reconciled to Category B without new Article cardinality; later exclusion persisted with null Article ID and rule/reason while executing no Article identity query/lock/touch or Category mutation; and later inclusion resolved the same Source identity and reconciled then-current Categories. Historical observation reasons remain preserved. Editorial edits do not bulk reprocess Articles.

## Collection, scheduling, and public-feed regression

Controlled integration proves Article-link policy precedes Relevance, Relevance precedes identity, excluded candidates use only exclusion persistence, included candidates use included persistence, and snapshot loading occurs once per bounded endpoint batch. Mixed processing and injected-failure tests preserve exact `created + updated + unchanged + rejected + excluded + failed = normalized_candidate_count` arithmetic in memory and persisted Collection-run counters. A deterministic exclusion does not fail the run, failed exclusion persistence does not increment `excluded`, and unrelated candidates remain isolated.

Manual and scheduled triggers instantiate the same production endpoint collection service and therefore share snapshot loading, evaluator, included/excluded persistence, endpoint lock/capacity, conditional fetch, accounting, and runtime reconciliation. Real PostgreSQL regressions cover due/no-longer-due scheduling, job claim/attempt/retry/cooldown, cross-process lock/capacity, validators, Source/endpoint failure isolation, and Worker lifecycle/recovery.

Public-feed PostgreSQL/HTTP regressions remain green: singleton public status, Source trust/lifecycle, Article visibility/group eligibility, effective-date ordering, and stored `original_url` are unchanged; operational collection state does not hide retained rows; and Category membership is not a feed-eligibility requirement. Source inspection confirms Web/API reads the public-feed repository and browser `/api/feed`; it does not collect Sources inline.

## Evidence boundary and conclusion

Browser evidence was not required because P1-P7 did not change public rendering/client behavior; backend HTTP and real-PostgreSQL public-feed regressions were run. Live-publisher evidence was not required because Phase 11 did not change publisher transport/parser/network behavior; controlled fixture transport/collection regressions were run. Neither unrun evidence type is represented as passing.

**Phase 11 exit gate: GREEN.** The exact executable tree satisfies the Phase 11 deterministic, integration, collection, scheduling, public-feed, and real-PostgreSQL requirements with no required unavailable evidence.

The intended next phase is **Phase 12 — Feed discovery features**. A separate later conversational `/closeout` is required to perform the authorized `0.12.0` baseline transition; P7 does not perform that transition.
