# Phase 6 — Article normalization validation

## Determination

**PARTIAL — APPROVED LIVE-SOURCE LEVEL 7 EVIDENCE PENDING**

Levels 1–5 are green for the Phase 6 candidate implementation. Level 7 produced complete accepted-candidate evidence for Author Media, but The Creative Penn did not complete transport within the production total deadline. Phase 6 is not accepted, the roadmap exit gate is not yet satisfied, and conversational `/closeout` is not authorized.

## Candidate identity and environments

- Validation date/time: 2026-08-10, approximately 09:55–10:18 CDT (UTC-05:00).
- Branch: `main`.
- Candidate implementation source SHA: `33e052d78a0293abacbd69c1f928cf741bd3135f`.
- Package version: `0.6.5`.
- Candidate change: the P5-authorized top-level `package.json` version transition from `0.6.4`; no executable defect or source/test change was required.
- Local runtime: Node.js `v24.11.1`; npm `11.6.2`; PostgreSQL client and server `18.3`.
- Dependency installation: `npm install` completed successfully (`189` packages audited, `0` vulnerabilities). The repository's no-lockfile policy was preserved; no `package-lock.json` or `npm-shrinkwrap.json` was created. This is not a byte-for-byte dependency-reproducibility claim.
- Database prerequisite present: `ARGUS_TEST_DATABASE_ADMIN_URL`. No secret value is recorded here.
- The same local environment performed deterministic, disposable-PostgreSQL, and approved-public-network validation.

## Executed validation

All passing deterministic commands below ran against source content identical to candidate SHA `33e052d78a0293abacbd69c1f928cf741bd3135f`; the aggregate final-tree reruns ran after that commit was established.

| Evidence | Command/procedure | Result |
| --- | --- | --- |
| Level 1 | `npm run format:check` | Passed. |
| Level 1 | `npm run lint` | Passed. |
| Level 1 | `npm run typecheck` | Passed. |
| Levels 1–3, 5 | `npm run check` | Passed on the committed candidate; format, lint, typecheck, and `197/197` ordinary tests passed with `0` skipped. |
| Level 2 | `npm run test:unit` | `122/122` passed; `0` skipped. |
| Level 3 | `npm run test:integration` | `37/37` passed; `0` skipped. |
| Level 5 | `npm run test:collection` | `38/38` passed; `0` skipped. |
| Levels 2, 3, 5 | `npm test` | `197/197` passed on the committed candidate; `0` skipped. |
| Level 4 | `npm run test:db` | `40/40` passed against real disposable PostgreSQL; `0` skipped. |
| Level 1 | `git diff --check ee231bf^..HEAD` | Passed with no whitespace errors for the accepted Phase 6 implementation range through the candidate. |
| Level 7 | `npm run test:live-sources` | Failed overall: Author Media passed with accepted normalized candidates and persisted provenance; The Creative Penn was independently attempted but hit `total_timeout` before parsing/normalization. |

No required deterministic suite selected zero tests, skipped required behavior, or used retries to mask a failure.

## Phase 6 behavior evidence

### Deterministic normalization and Article-link policy — Levels 2 and 5

The unit and controlled production-stack fixture matrices proved:

- deeply equal deterministic, deeply frozen output from repeated fixed Raw item/context input without input mutation;
- required title and URL behavior below, at, and above governed bounds;
- safe display-title cleanup and conservative normalized-title handling;
- entity decoding, whitespace/Unicode handling, and script/style/markup removal;
- bounded plain-text summaries and optional image/category/language behavior;
- RSS/RFC and Atom/ISO dates plus missing, invalid, impossible, and ambiguous dates without fabricated collection timestamps;
- relative Article URL resolution from the terminal redirected feed URL;
- preservation of the original destination separately from canonical identity;
- fragment and exact governed tracker removal while preserving semantic, repeated non-tracking, path, and trailing-slash semantics;
- opaque external identifiers and complete Publication/Source/endpoint/run provenance;
- exact approved host, subdomain, IDN/case, endpoint narrowing, sibling/suffix-confusion, malformed URL, credentials, unsupported scheme, and original-URL policy behavior;
- a non-network Article-link decision boundary with no DNS/socket/HTTP behavior and without reusing Phase 4 fetch-port policy.

The controlled Level 5 corpus exercised RSS, Atom, terminal-path redirect plus relative Article URL, tracking/fragment/semantic query handling, markup/entities, valid/missing/invalid dates, malformed-item isolation, cross-domain rejection isolation, zero-item feeds, exact accounting, and deterministic reruns through the canonical endpoint service. Earlier redirect, conditional response, size/decompression, timeout, content-type, and parser behavior remained green without public-network dependencies.

### Canonical Worker integration and inspection — Level 3

Integration evidence proved the canonical order `eligibility → lock → run start → fetch → parse → normalize → Article-link policy → finalization → release`. It also covered zero/all/mixed valid items, ordinary normalization failures, ordinary Article-link rejections, fatal normalizer and policy execution failures, truthful stage failure mapping, 304 and earlier-stage short circuits, finalization failures/mismatches, lock release, and independent endpoint execution after failure.

The persisted run ID and fetcher's terminal `finalUrl` enter normalizer context. Successful downstream results contain only link-accepted normalized candidates. Worker output is bounded to at most three metadata-only samples with title, original/canonical URL, publication-date status, and Publication/Source/endpoint/run provenance; Raw bodies, summaries/full content, credentials, database URLs, remote bodies, and stack traces are excluded.

### Migrations and persisted accounting — Level 4

Real PostgreSQL tests proved production migrations apply from zero and rerun idempotently. The actual `0002 → 0003` upgrade preserves representative Phase 5 rows and maps historical parser-success rows to normalization `not_run` with zero Phase 6 counters without rewriting history.

Database constraints/repositories enforce the normalization vocabulary, nonnegative counters, rejection/count relationships, truthful `not_run`, parser-success prerequisites, successful-batch arithmetic, and overall/stage consistency. Mixed counts round-trip correctly, terminal finalization remains guarded, rollback behavior remains intact, and disposable database cleanup was verified. A canonical `collectEndpoint()` database test proved returned mixed-batch accounting and real run provenance match the persisted Collection run. Phase 6 has no Article table or Article persistence.

## Approved live-source observations — Level 7

The live suite used a unique disposable PostgreSQL database, production migrations and bootstrap, production resolver/network-safety/HTTP/redirect/parser/normalizer/Article-link policy/run persistence, and the canonical Worker command. Both configured approved endpoints were attempted independently; cleanup completed through the suite's disposable-database boundary.

### Author Media — observed green

- Configuration: Publication `indie-author-publishing-news`; Source `author_media`; endpoint `site_rss`; approved URL `https://www.authormedia.com/feed/`.
- Two independent Worker executions succeeded with HTTP `200`, transport/parser/normalization `succeeded`, `0` redirects, `21,684` wire bytes, and `138,079` decompressed bytes.
- Each run produced `100` Raw items, `100` normalized candidates, `0` normalization failures, and `0` Article-link rejections.
- First persisted Collection run: `297671fe-b320-453b-9ba1-c48ec02f4419`; second: `018d7a11-845a-41f5-a95c-093a626050b1`.
- Bounded sample evidence included the title `SEO for Author Websites: The Only Guide You Need in 2026`, original/canonical destination `https://www.authormedia.com/seo-for-author-websites-the-only-guide-you-need-in-2026/`, parsed date `2026-08-05T07:02:00.000Z`, and matching Publication/Source/endpoint/run provenance.

### The Creative Penn — attempted, pending successful evidence

- Configuration: Publication `indie-author-publishing-news`; Source `the_creative_penn`; endpoint `podcast_rss`; approved URL `https://www.thecreativepenn.com/feed/podcast/`.
- The independent production Worker attempt received HTTP `200` and read `1,056,557` wire bytes / `3,499,067` decompressed bytes, then ended at approximately `15,038 ms` with bounded reason `total_timeout`.
- Persisted Collection run: `d97d360d-3f60-4fff-8ae5-68e0ec065b43`.
- Truthful terminal state: overall/transport `failed`; parser and normalization `not_run`; Raw, normalized, normalization-failure, and Article-link-rejection counts all `0`.
- No accepted normalized candidate can be claimed for this Source from this run. Production timeout policy was not weakened, configuration was not widened, and the failure was not hidden by an automatic retry.

## Scope and preserved behavior inspection — Levels 0 and 1

The final tree keeps normalization generic and topic-independent; parser Raw items remain separate from candidates; original destinations remain distinct from canonical identity URLs; Article-link policy remains a separate non-network post-normalization gate; and the Worker remains the sole collection owner with no Web/API inline fetch path.

No Phase 7 Relevance implementation, Article schema/persistence/observations, identity/concurrency, post-identity counters, duplicate machinery, public/admin feed UI/API, scheduler/jobs/health, HTML/custom/browser collector, topic-specific exception, or automatic Source/domain discovery/widening was introduced. Existing Web/Worker health and lifecycle, configuration ownership/bootstrap, migration history, Phase 4 safety/locking, Phase 5 transport/parser limits, Collection-run provenance/finalization, failure isolation, and deterministic no-public-network regression behavior remained green.

## Exit-gate mapping and remaining handoff

1. Deterministic normalized output: **green** at Levels 2 and 5.
2. Unsafe/out-of-policy Article destinations rejected before persistence: **green** at Levels 2, 3, and 5.
3. Real approved Source candidates inspectable with endpoint/run provenance: **partial** at Level 7; proven for Author Media, not yet proven for The Creative Penn because transport timed out before parsing.
4. Malformed, boundary, URL, date, markup, and determinism fixture coverage: **green** at Levels 2 and 5.

To complete Stage 2, inspect this artifact and then run exactly:

```powershell
npm run test:live-sources
```

Required prerequisite variable: `ARGUS_TEST_DATABASE_ADMIN_URL` (safe test-admin PostgreSQL only; never substitute application development/production data). Run against candidate implementation SHA `33e052d78a0293abacbd69c1f928cf741bd3135f`, or a tree differing only by this validation artifact/docs-only evidence commits. A successful run must provide accepted normalized candidates with matching persisted provenance for both named approved Sources. If Creative Penn continues to exceed the governed production timeout, treat that as a blocker requiring deliberate owner-directed follow-up; do not silently raise limits, widen domains, or bypass safety.

Level 6 browser validation was not required or claimed. Level 8 reference-deployment validation was not required or claimed.

**Conversational `/closeout` must NOT run yet.**
