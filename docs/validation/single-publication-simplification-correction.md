# Single-Publication Simplification Correction Validation

## Accepted source and environment

- Validation date: August 11, 2026.
- Accepted executable source SHA: `2cb9b2f747957324dfa15ad12fa6535f62ed3ee4`.
- Reviewed correction range: `daa3b24..2cb9b2f747957324dfa15ad12fa6535f62ed3ee4`.
- Correction commits:
  - `715eb2f` — `c10-single-publication/P1: Canonical singleton data and runtime reset`.
  - `2cb9b2f` — `c10-single-publication/P2: Canonical root surface and legacy-tree cleanup`.
- Authoritative package version: `0.10.0`, read from `package.json` at the accepted source SHA.
- Platform: Windows, PowerShell execution environment.
- Node.js: `v24.11.1`.
- npm: `11.6.2`.
- PostgreSQL server used by the disposable test harness: `18.3`.
- Playwright: `1.56.1`.
- Playwright-managed Chromium: revision `1194`, browser version `141.0.7390.37`.

The accepted executable source SHA is the clean, committed P1/P2 implementation before this evidence artifact was created. The later documentation-only evidence commit is not represented as runtime-tested source.

## Correction scope and accepted shape

The review and executed evidence establish the Phase 10 entry correction only. No ordinary Phase 10 scheduler, durable-job, retry/backoff, or endpoint-health implementation was added.

The accepted active tree has:

- one canonical migration, `migrations/0001_initial_schema.sql`, which creates the complete implemented schema from zero;
- database-enforced singleton `publication_settings` containing descriptive/editorial settings and no Publication UUID or slug;
- installation-wide Source `config_key` identity;
- Source-scoped endpoint key and endpoint URL identity;
- Source -> endpoint -> Collection run ownership;
- Source-scoped Article strong and fallback identity;
- Source/endpoint/run/Article observation provenance enforced by composite foreign keys;
- singleton `active_for_collection` as the global collection gate;
- Worker selection by Source key plus endpoint key only;
- selector-free `readPublicFeed` behavior and canonical `GET /api/feed`;
- canonical public page `GET /`;
- singular `src/publication/` module and `config/publication.json` bootstrap path.

The six obsolete evolutionary migrations were removed. No compatibility migration or populated-old-schema upgrade fixture remains in the active tree. The generic migration ledger, checksum, advisory-lock, transaction, pending-status, and incompatible-history behavior remains covered.

## Review and structural evidence

Level 0 inspection traced the complete P1/P2 range through migrations, singleton configuration/bootstrap/repository code, Source and endpoint repositories, collection eligibility and execution, candidate provenance, Article identity/persistence and observations, Worker invocation, public-feed repository/API, root page/client, configuration, and current tests.

Level 1 checks included `git diff --check daa3b24..HEAD`, committed-range name/status and content inspection, active-tree file-layout inspection, route inspection, and fixed-string searches over active implementation/configuration/migration/test source for:

- `publication_id` and `publicationId`;
- `publicationSlug` and active slug selectors;
- `/api/publications/` and `/publications/:`;
- `config/publications/`;
- `findPublicationBySlug`;
- `src/publications` compatibility paths;
- deleted migration filenames `0001_publication_source_configuration` through `0006_article_visibility`;
- ignored/deprecated Publication selector parameters;
- scheduler, durable-job, retry/backoff, and endpoint-health work in the correction range.

No legacy-only active implementation artifact was found. Remaining matches are intentional negative regression tests proving old columns, routes, fields, or argument shapes are rejected or absent; generic task-runner uses of the word `slug` are unrelated to Publication runtime selection. Current singleton Publication terms remain only for legitimate editorial/settings behavior, such as name, public status, collection-active state, and the stable `publication_inactive` decision reason.

The correction range contains no governing-document changes and no deletion or rewrite of historical task prompts or validation artifacts. `package-lock.json` and `npm-shrinkwrap.json` were absent before and after validation. `git status --short` was empty before closeout writes.

## Commands and observed results

All required commands ran against accepted executable source SHA `2cb9b2f747957324dfa15ad12fa6535f62ed3ee4`.

| Command | Observed result |
| --- | --- |
| `npm install` | PASS — dependencies already up to date; 191 packages audited; 0 vulnerabilities; no package lock created. |
| `npm run format:check` | PASS — all matched files use Prettier formatting. |
| `npm run lint` | PASS — ESLint completed with no findings. |
| `npm run typecheck` | PASS — TypeScript completed with no errors. |
| `npm run test:unit` | PASS — 194 passed, 0 failed, 0 skipped. |
| `npm run test:integration` | PASS — 48 passed, 0 failed, 0 skipped. |
| `npm run test:collection` | PASS — 38 passed, 0 failed, 0 skipped. |
| `npm run test:db` | PASS — 71 passed, 0 failed, 0 skipped against real disposable PostgreSQL. |
| `npm test` | PASS — 280 passed, 0 failed, 0 skipped. |
| `npm run check` | PASS — formatting, lint, typecheck, and the 280-test ordinary suite all passed. |
| `npm run test:browser` | PASS — 9 passed, 0 failed, 0 skipped in real Playwright-managed Chromium. |

Supplemental prompt-stack validation passed with `npm run codex:phase:validate -- c10-single-publication`: the stack was recognized as a non-versioned Phase 10 correction, all three prompts required unchanged version `0.10.0`, and P3 was recognized as the final manual closeout. An earlier supplemental invocation incorrectly supplied `docs/tasks/c10-single-publication`, which the validator treated as a duplicated path and rejected with `ENOENT`; the canonical folder-name invocation above then passed. This operator invocation error did not modify the tree or affect product evidence.

## Evidence conclusions

### Levels 1-3 and 5 — static, unit, integration, and controlled collection

Formatting, lint, type checking, unit, integration, ordinary aggregate, and controlled RSS/Atom/HTTP fixture suites are green. The executed coverage includes Worker argument validation before database/network setup, Source/endpoint lookup, singleton collection eligibility, endpoint locking, request and redirect network safety, parser -> normalization -> Article-link policy -> Relevance -> identity ordering, bounded failure handling, per-endpoint isolation, truthful run counters, selector-free API behavior, and canonical root/static delivery.

### Level 4 — real PostgreSQL

The 71-test database suite used the repository's guarded disposable-database harness and PostgreSQL `18.3`. It passed fresh migration from zero, migration rerun behavior, singleton settings enforcement, installation-wide Source uniqueness, Source-scoped endpoint identities, configuration/domain/state constraints, Collection-run lifecycle and arithmetic constraints, Source-scoped Article strong/fallback identities, full-value digest collision defense, fallback-to-strong promotion, contradictory identity conflict, concurrent/racing identity serialization, first/last-seen semantics, per-candidate rollback, unrelated-candidate isolation, observation ownership constraints, bootstrap idempotency/no-overwrite/rollback, endpoint locks, public-feed eligibility/order/bounds, and real process/HTTP behavior.

No Publication UUID or slug was needed for these proofs. Articles contain no Publication tenant scope, and observation constraints reject cross-Source endpoint, run, and Article combinations.

### Level 6 — real Chromium

The 9-test browser suite launched Chromium and passed direct `GET /` navigation, refresh, loading, populated, public-empty, absent/private generic-unavailable, dependency-error, exact stored external publisher `href`, inert untrusted text, UTC date rendering in a non-UTC browser context, keyboard focus, desktop three-column layout, representative mobile stacking, and no feed-caused horizontal overflow. Integration coverage separately proves the old slug-addressed page and API routes are unsupported and same-origin static assets/security headers remain functional.

## Limitations and operational note

- No old populated pre-production database was upgraded or preserved. That behavior is intentionally unsupported by the correction contract.
- No arbitrary database discovered through environment variables was destroyed or rebuilt. The executed database evidence used only the guarded disposable test harness.
- An operator with a local database created by the superseded source tree must deliberately destroy/recreate it, then run `npm run db:migrate` and `npm run db:bootstrap` with the current code and canonical `config/publication.json`.
- `npm run test:live-sources` was not run. Level 7 public-network success is environment-dependent and is not required for this deterministic correction closeout. Historical Phase 5 and Phase 9 live-source artifacts were not altered.
- Dependency installation confirms the currently resolved environment passed; without a project lockfile, it is not a byte-identical dependency-reproduction claim.

## Closeout determination

**Phase 10 entry singleton implementation correction gate: GREEN.**

The accepted tree is the smallest coherent supported one-Publication-per-installation foundation, package version remains `0.10.0`, and ordinary Phase 10 implementation planning may begin. This correction closeout does not invoke roadmap `/closeout` and does not transition the package version.
