# Phase 14 — Source Administration Validation

## Closeout status

**BLOCKED / RED — 2026-08-14 01:48:00 -05:00.**

The local final-candidate validation matrix is green, but Phase 14 cannot close because the required Level 8 Cloudflare Access/direct-origin validation was not observable. The repository contains no supported/reference deployment configuration or procedure, and no deployed admin URL, authorized operator path, or actual origin topology was available in this validation environment. Local application tests do not prove that an external Cloudflare Access perimeter or direct-origin protection exists.

The next roadmap phase remains Phase 14 until that blocking perimeter evidence is observed. The later conversational `/closeout` transition to the Phase 15 `0.15.0` baseline is not performed by this P8 validation attempt.

## Candidate and implementation range

- Package version: `0.14.8`.
- Phase implementation base (after task-writing commits, before P1 implementation): `999f4529dda8f602906fd3a2559413bab5ece724`.
- P7 implementation commit: `f0bfa43932f479bc9f0f5b6d740eee952728859b`.
- Validation checkout base: `1f5fe8bf5c241d3a2c7813af32d6cca655c050ac` on `main`, with the P8 package-version change and this validation artifact in the working tree. No bounded implementation defect was found or fixed during P8.
- The validated implementation range was inspected as `999f452...f0bfa43`; final whitespace validation is run against the same Phase implementation base and the P8 candidate tree.

## Environment

- Windows desktop validation environment.
- Node.js `v24.11.1`; npm `11.6.2`.
- PostgreSQL `18.3`, through the repository's disposable database harness.
- Playwright `1.56.1`; Chromium `141.0.7390.37`.
- Dependencies were installed with `npm install`; no `package-lock.json` or `npm-shrinkwrap.json` was created.

## Evidence gathered

### Level 0/1 — contract and architecture inspection

Inspected the Phase 14 P1–P7 task stack, roadmap, domain/source/public/admin/testing contracts, system architecture, operations guidance, and the Cloudflare Access ADR. Inspected the final migration chain, Source/configuration repositories, bootstrap, admission evaluator and collection pipeline, admin routers/services, durable job repository/execution/finalization, scheduler, run/health reads, browser resources, and public-feed consumers.

The final structure remains topic-independent: the RSS/Atom admission evaluator is Source-owned, include-only, and uses no publishing-specific phrases. It is called after parsing and before normalization; endpoint-level filter overrides and a second Relevance predicate were not introduced. The application retains singleton Publication configuration without relational tenancy selectors, a single durable endpoint-job queue, direct Worker manual execution, and enqueue-only Web/API check-now behavior. No native accounts/sessions/roles, Phase 15 Publication/Relevance administration, Article/duplicate moderation, or generic endpoint deletion surface was found.

No tracked deployment, Cloudflare Tunnel, origin-firewall, container, or reference-deployment procedure was found. This inspection is not Level 8 perimeter proof.

### Levels 1–6 — automated final-candidate matrix

The following commands were executed against the `0.14.8` candidate after dependency installation:

| Command | Result |
| --- | --- |
| `npm run format:check` | Passed. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | Passed with no skipped/todo tests. |
| `npm run test:integration` | Passed with no skipped/todo tests. |
| `npm run test:collection` | Passed with no skipped/todo tests. |
| `npm run test:browser` | Passed in real Playwright Chromium with no skipped/todo tests. |
| `npm test` | Passed: 406 tests, 0 failed, 0 skipped, 0 todo. |
| `npm run check` | Passed. |
| `npm run codex:phase:validate -- p14` | Passed; P8 is the sole manual closeout prompt. |
| `npm run test:db` | Passed: 169 tests, 0 failed, 0 skipped, 0 todo, using real disposable PostgreSQL. |

Focused final-tree coverage exercised the following Phase 14 behaviors:

- Source priority/admission phrase persistence, validation, bootstrap no-overwrite behavior, migration-from-zero, revised filtered-item accounting, and unchanged downstream accounting.
- RSS and Atom parser-to-Raw-item fixture paths; deterministic literal any-match behavior over title, visible content, and Source categories; markup/script/style exclusion; prospective filtering; all-items-filtered successful runs; and no mismatch observation, Relevance exclusion, or candidate processing.
- Admin default-off routing, bounded JSON/error handling, no-store/CSP/security headers, custom-header request integrity, no permissive CORS, and preserved public routes.
- Source/endpoint resource ownership, immutable keys, transactional domain/narrowing/default-Category/state/archive/restore rules, and no inline endpoint contact during admin mutation.
- Manual and scheduled durable jobs, outstanding-slot concurrency, trigger-preserving retries/recovery/deferral, run/job trigger integrity, scheduled-only due optimization, direct Worker manual execution, health separation, and bounded newest-first run reads including `sourceItemFilteredCount`.
- Browser workflows at 1280x900 and 390x844: disabled/empty/error/ready admin states; Source and endpoint create/edit/state workflows; phrase add/remove collect-all semantics; check-now queued/outstanding/ineligible presentation; request-integrity header emission; health/run presentation; form-error retention; focus visibility; wrapping/no horizontal overflow; and unchanged public root behavior.

### Level 4 — persistence and recovery

`npm run test:db` completed the supported disposable PostgreSQL harness. Its 169 passing tests include migration-from-zero, Source/filter persistence, Collection-run constraints/accounting, Source/endpoint transactional relationship validation, job uniqueness/concurrency/trigger provenance, stale recovery, Worker orchestration, identity/observation provenance, scheduler/health, and public-feed regressions. No database suite case was skipped or selected zero tests.

### Level 5 — deterministic collection fixtures

The collection suite and Phase 14 integration/database cases exercised controlled RSS and Atom fixture parsing through the real Raw-item admission boundary. This provides deterministic fixture evidence for admission placement, literal matching, unsafe-markup handling, all-filtered accounting, and preservation of the downstream collection pipeline. It does not claim current live-publisher behavior.

### Level 6 — browser evidence

The Playwright suite launched real Chromium and passed the dedicated Source-administration workflows. Browser assertions observed both representative viewports: 1280x900 desktop for Source/endpoint workflow and 390x844 mobile for keyboard focus, long untrusted content wrapping, minimum practical touch target, and no horizontal document overflow. The browser harness is deterministic and does not claim Cloudflare authentication or publisher-network collection.

## Required Level 8 perimeter gate — not observed

The following mandatory observations were not possible in this environment:

1. an unauthenticated deployed `/admin` request challenged or denied by Cloudflare Access before the application shell;
2. an authorized operator reaching the deployed admin shell through Access;
3. a direct-origin bypass attempt failing against the actual deployment topology; and
4. identification of the actual direct-origin control (for example a Tunnel with no public origin route, firewall restriction, or authenticated origin connectivity).

No Access cookies, tokens, authorization headers, tunnel credentials, database credentials, or other secrets were recorded. The absence of a supported reference deployment/procedure is a blocking prerequisite, not a test skip that can count as green evidence.

## Feature idea disposition

`+W6HF` remains under **Promoted Ideas** with status **Approved for Phase 14**. It is not moved to Shipped Ideas because the exact Phase 14 tree is blocked at the required Level 8 exit gate, despite the completed local implementation evidence.

## Conclusion

Phase 14 source/filter/admin/job/browser behavior has green Levels 1–6 evidence on the recorded candidate. Phase 14 is **BLOCKED / RED** pending observed reference-deployment Cloudflare Access and direct-origin-bypass evidence. Do not advance to Phase 15 or run conversational `/closeout` until that gate is satisfied.
