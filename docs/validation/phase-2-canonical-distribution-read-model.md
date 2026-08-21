# Phase 2 — Canonical distribution read model validation

## Result and identity

- Status: **Phase 2 GREEN — HUMAN REVIEW REQUIRED**.
- Phase 2 base: `31c40d8a32c9ad537a182b54cbdab8cebe245b0c`.
- P1: `bb0e98841da2d95e5949dab7d91e69b6741b7ed3` (`1.2.1`).
- P2: `920fd421374961b9b76df0776223bce0d14c94b6` (`1.2.2`).
- P3: `59d041659db75db9ae56f1bc9715a285f9983fd5` (`1.2.3`).
- P4 closeout: HEAD `59d041659db75db9ae56f1bc9715a285f9983fd5` plus the uncommitted `package.json` and `src/public-feed/repository.ts` executable diff whose Git binary-diff object identity is `8a33ecb146cf9acaf117875c9e9323098f0dd6d0`, plus this artifact. Human acceptance and commit remain required.
- Package version: `1.2.4`. No `package-lock.json` or `npm-shrinkwrap.json` exists.
- Observed environment: Node `v24.11.1`; npm `11.6.2`; PostgreSQL client `18.3`; Playwright `1.56.1`. The database suite provisioned real disposable PostgreSQL databases without prerequisite skips.
- No migration or schema file changed from the Phase 2 base.

## Final validation

- `npm run check` — PASS: formatting, lint, typecheck, and 484 tests in 31 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run test:db` — PASS: 233 tests in 5 suites passed against real disposable PostgreSQL; 0 failed/cancelled/skipped/todo.
- `npm run test:browser` — PASS: 42 tests in 6 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run codex:phase:validate -- p1-2` — PASS: exactly contiguous P1–P4, assigned versions `1.2.1`–`1.2.4`, supported model labels, and one final manual P4 closeout.
- `git diff --check 31c40d8...HEAD` — PASS for the committed Phase 2 range.
- `git diff --check` — PASS for the uncommitted closeout tree before this artifact write.

The source/unit/integration portions are Level 1–3 evidence. The complete database suite is Level 4 evidence for PostgreSQL eligibility, ordering, microsecond positions, Profile aggregation/filtering, repeatable-read coherence, revision invalidation, and traversal behavior. The complete browser suite is Level 5 evidence for the bundled/reference frontend after its public-feed producer changed. No Level 7 live-Source or Level 8 deployment/customer evidence is claimed or required for this transport-independent phase.

## Pass 1 — contract and evidence review

- Canonical outward authority: `canonical-outward-articles.ts` is the single governed SQL/projection authority shared by the public feed and Profile reads. It owns approved+active Source eligibility, visible Article state, ungrouped-or-Primary duplicate suppression, moderated headline and Categories, stored `original_url`, canonical global order, and PostgreSQL microsecond continuation positions. Operational Source state, endpoint/run health, and Publication collection state are not eligibility gates.
- Existing reference surfaces: `readPublicFeed` retains the independent `public_status = public` gate, existing Source/Category/keyword discovery criteria, legacy criteria-bound cursor, response projection, and non-frozen pagination behavior. Database and browser regressions prove private/absent/error behavior, effective moderation, duplicate suppression, exact links, keyword fields, pagination, SSR, and progressive enhancement.
- Profile snapshot: `profile-snapshot.ts` reads the Phase 1 aggregate, Publication name, and bounded per-Source canonical candidates in one read-only `REPEATABLE READ` transaction. Missing/draft/disabled/active/read-failed remain typed. Only active Profiles read Articles. Profile selectors narrow canonical eligibility with OR inside each list, AND across dimensions, exclusion precedence, literal case-insensitive headline/author/summary matching, effective Categories, pre-bound filtering, and canonical multi-Source merge ordering. `public_status` and Source operational state are irrelevant.
- Guaranteed producer fields: the page service supplies Profile key/name, Publication name, Article ID, moderated headline, exact original URL, effective date/date source, nullable published date/author/summary/image, Source key/name, and an explicit Category collection. Persistence-only Profile state and cursor positions are not exposed as Article fields.
- Revision and continuation: the revision is a versioned SHA-256 hash of explicitly assembled governed Profile, Publication, Source-selector, outward Article, Category, and exact order material. It excludes incidental timestamps and operational/public state. The separate canonical base64url cursor is bounded, versioned, canonical, Profile-bound, revision-bound, and position-bound. Paging uses the microsecond order tuple, rejects malformed/wrong-Profile/current-revision-invalid-position cursors, returns typed `snapshot_changed` for relevant mutations, and has no HTTP/auth concerns.
- Scope: no v1 HTTP API, authentication, credential, ETag, rate-limit, PHP/LKG, adapter, schema, or post-2.0 capability was implemented.

## Pass 2 — adversarial review

Source structure plus unit/database/browser evidence protect the applicable missing Publication; missing/draft/disabled/active/empty/bounded Profile; zero/multiple Source; approved/lifecycle versus operational-state; empty/overlapping/literal-special-character/nullable Profile text; effective Category override; hidden/archived/duplicate-Primary; exact timestamp and microsecond tie; page boundary/exhaustion; malformed/oversized/noncanonical/wrong-version/wrong-Profile/tampered/stale/current-revision-invalid-position cursor; relevant versus irrelevant mutation; bounded-window change; Profile/Source/Publication metadata change; coherent read interleaving; rollback/dependency failure; public-feed regression; and bounded error cases.

The adversarial disposition is protected behavior with no unresolved defect: `%`, `_`, backslash, brackets, punctuation, and similar values remain SQL parameters consumed by `strpos`, not pattern syntax; nullable author/summary do not match; effective Category overrides are resolved before selectors; Source unapproval/archive changes eligibility and revision while paused/disabled operation does not; Publication name changes revision while `public_status` does not; and continuation accepts only a position present in the current bounded snapshot. No raw SQL, connection, or internal exception details cross the typed producer boundary.

## Pass 3 — structural review

Canonical Article SQL and effective Category interpretation live in one producer module used by both outward paths. Profile aggregate loading remains in the Phase 1 repository; Profile filter semantics remain confined to the distribution read boundary. The snapshot transaction is read-only repeatable-read and adds no advisory/write locks. Revision and distribution cursor code are explicit, versioned, and separate from the legacy public cursor. PostgreSQL timestamp strings retain microseconds while `Date` values serve outward metadata only. Reads are bounded by the Profile maximum of 1,000 and at most 64 filters per dimension; there is no unbounded history scan, offset pagination, speculative generic framework, HTTP/auth leakage, or persistence identifier exposure.

One dead commented copy of the superseded public-feed SQL remained after P1 extraction. P4 removed that compatibility-only block without runtime behavior change and reran the complete required matrix. No meaningful behavior-preserving refactor was required, and no Terra High remediation handoff occurred.

## Phase 4 producer handoff

| Downstream-required capability | Owning implementation/export | Focused proof |
| --- | --- | --- |
| Profile lookup and lifecycle, including missing/draft/disabled | `createDistributionProfileSnapshotService` and `createDistributionProfilePageService` typed outcomes | `distribution-profile-snapshot.test.ts`; `distribution-profile-page.test.ts` |
| Profile and Publication metadata | `DistributionProfileSnapshot` / active page outcome | snapshot database tests; revision unit test |
| Guaranteed v1 Article fields and null/empty shape | `CanonicalOutwardArticle` and `DistributionProfilePageItem` | canonical producer database tests; page unit tests |
| Effective Categories | canonical outward SQL projection | canonical producer and Profile snapshot database tests |
| Profile filters | `readCanonicalOutwardArticlesForProfileSource` | Profile snapshot database tests |
| Result/history bound | Profile aggregate `resultLimit`, bounded per-Source reads, global slice | Profile snapshot and paging database tests |
| Canonical order and microsecond continuation position | canonical producer `orderPosition` and comparator | canonical producer and paging database tests |
| `snapshotRevision` | `distributionSnapshotRevision` | revision unit test; paging database mutation proof |
| Cursor encode/decode | `encodeDistributionCursor` / `decodeDistributionCursor` | cursor unit test |
| Keyset continuation and exact exhaustion | `createDistributionProfilePageService` | page unit traversal; paging database test |
| `snapshot_changed` | page service revision comparison | page unit stale-cursor test; paging database mutation proof |
| Bounded dependency/input failures | snapshot/page typed outcomes | page unit lifecycle/dependency tests; repository regressions |

Phase 4 can remain a thin authenticated HTTP serializer/controller. It does not need to invent Article SQL, Profile child-table SQL, eligibility, filters, Category semantics, ordering, revisions, cursor construction, lifecycle distinctions, or continuation behavior.

## Limitations and next step

No unresolved Phase 2 blocker remains. Live-Source, security, recovery, and deployment suites were not run because the integrated Phase 2 diff changes no live collection, security, schema/migration/recovery, or deployment boundary. This artifact does not perform or authorize conversational roadmap `/closeout` and does not advance to `1.3.0`.

After human review accepts and commits this exact closeout tree and artifact, the next workflow step is conversational `/closeout`, which may perform the separately governed package-only transition to the Phase 3 `1.3.0` baseline.
