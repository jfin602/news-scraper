# Phase 6 — Article normalization validation

## Determination

**PHASE 6 GREEN — ACCEPTED**

Levels 1–5 are green for the Phase 6 candidate implementation, and the repository-owner VPS Level 7 run subsequently observed both approved live Sources completing successfully through the production Phase 6 Worker path with normalized candidates and persisted Collection-run provenance. Every Phase 6 roadmap exit-gate item is satisfied. Conversational `/closeout` is now authorized, subject to its normal structural drift check.

## Candidate identity and environments

- Branch: `main`.
- Accepted Phase 6 implementation source SHA: `33e052d78a0293abacbd69c1f928cf741bd3135f`.
- Package version: `0.6.5`.
- Candidate change: the P5-authorized top-level `package.json` version transition from `0.6.4`; no executable defect or source/test change was required during P5.
- Docs-only evidence lineage after the candidate includes initial partial artifact commit `7a88da89360a6f9ab8d838b8c1ecb08c7df46035` and corrected partial evidence commit `3b9a1d98d844bbee6de497b0a64abc5969fea86f`; these evidence updates do not redefine the accepted implementation SHA.
- Local deterministic/database validation: 2026-08-10, approximately 09:55–10:27 CDT (UTC-05:00).
- Local runtime: Node.js `v24.11.1`; npm `11.6.2`; PostgreSQL client and server `18.3`.
- Dependency installation: `npm install` completed successfully (`189` packages audited, `0` vulnerabilities). The repository no-lockfile policy was preserved; no `package-lock.json` or `npm-shrinkwrap.json` was created. This is not a byte-for-byte dependency-reproducibility claim.
- Local database prerequisite loaded from the root `.env`: `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL`. No secret value is recorded here.
- Repository-owner VPS Level 7 validation: 2026-08-10 at approximately 10:40 CDT (UTC-05:00); the supplied terminal transcript itself did not print a wall-clock timestamp.
- VPS path shown in the supplied terminal context: `/www/news-scraper`; the live command output identified package version `0.6.5`.
- VPS PostgreSQL client `16.14` was observed during the immediately preceding test-admin prerequisite setup. VPS Node/npm versions and PostgreSQL server version were not printed in the supplied Level 7 transcript and are therefore not claimed here.
- The supplied VPS transcript did not print `git rev-parse HEAD`; the repository owner supplied the run as Stage 2 evidence for the established `0.6.5` Phase 6 candidate/docs-only evidence lineage. The accepted executable implementation remains the exact candidate SHA above.

## Executed validation

All deterministic commands below ran against source content identical to accepted candidate SHA `33e052d78a0293abacbd69c1f928cf741bd3135f`; the aggregate final-tree reruns ran after that candidate was established. The owner-requested local rerun executed the named deterministic/database commands again with the correct News Scraper test-admin prerequisite.

| Evidence | Command/procedure | Result |
| --- | --- | --- |
| Level 1 | `npm run format:check` | Passed. |
| Level 1 | `npm run lint` | Passed. |
| Level 1 | `npm run typecheck` | Passed. |
| Levels 1–3, 5 | `npm run check` | Passed; format, lint, typecheck, and `197/197` ordinary tests passed with `0` skipped. |
| Level 2 | `npm run test:unit` | `122/122` passed; `0` skipped. |
| Level 3 | `npm run test:integration` | `37/37` passed; `0` skipped. |
| Level 5 | `npm run test:collection` | `38/38` passed; `0` skipped. |
| Levels 2, 3, 5 | `npm test` | `197/197` passed; `0` skipped. |
| Level 4 | `npm run test:db` | `40/40` passed against real disposable PostgreSQL; `0` skipped. |
| Level 1 | `git diff --check ee231bf^..HEAD` | Passed with no whitespace errors for the accepted Phase 6 implementation range through the candidate. |
| Level 7, local Windows/hotspot | `npm run test:live-sources` | Author Media succeeded; The Creative Penn received HTTP `200` but hit the production `total_timeout` on the throttled phone-hotspot path before parsing/normalization. This did not alter production limits or configuration. |
| Level 7, repository-owner VPS | `npm run test:live-sources` | Passed: `1/1` live suite, `0` failed, `0` skipped; both approved Sources each completed twice with successful transport/parser/normalization and persisted run provenance. |

No required deterministic suite selected zero tests, skipped required behavior, or used retries to mask a failure. The successful VPS Level 7 run used the unchanged production 15-second total transport deadline.

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
- opaque external identifiers and complete Publication/Source/endpoint/Collection-run provenance;
- exact approved host, subdomain, IDN/case, endpoint narrowing, sibling/suffix-confusion, malformed URL, credentials, unsupported scheme, and original-URL policy behavior;
- a non-network Article-link decision boundary with no DNS/socket/HTTP behavior and without reusing Phase 4 fetch-port policy.

The controlled Level 5 corpus exercised RSS, Atom, terminal-path redirect plus relative Article URL, tracking/fragment/semantic query handling, markup/entities, valid/missing/invalid dates, malformed-item isolation, cross-domain rejection isolation, zero-item feeds, exact accounting, and deterministic reruns through the canonical endpoint service. Existing redirect, conditional response, size/decompression, timeout, content-type, and parser behavior remained green without public-network dependencies.

### Canonical Worker integration and inspection — Level 3

Integration evidence proved the canonical order `eligibility → lock → run start → fetch → parse → normalize → Article-link policy → finalization → release`. It covered zero/all/mixed valid items, ordinary normalization failures, ordinary Article-link rejections, fatal normalizer and policy execution failures, truthful stage failure mapping, 304 and earlier-stage short circuits, finalization failures/mismatches, lock release, and independent endpoint execution after failure.

The persisted run ID and fetcher's terminal `finalUrl` enter normalizer context. Successful downstream results contain only link-accepted normalized candidates. Worker output is bounded to at most three metadata-only samples with title, original/canonical URL, publication-date status, and Publication/Source/endpoint/run provenance; Raw bodies, summaries/full content, credentials, database URLs, remote bodies, and stack traces are excluded.

### Migrations and persisted accounting — Level 4

Real PostgreSQL tests proved production migrations apply from zero and rerun idempotently. The actual `0002 → 0003` upgrade preserves representative Phase 5 rows and maps historical parser-success rows to normalization `not_run` with zero Phase 6 counters without rewriting history.

Database constraints/repositories enforce the normalization vocabulary, nonnegative counters, rejection/count relationships, truthful `not_run`, parser-success prerequisites, successful-batch arithmetic, and overall/stage consistency. Mixed counts round-trip correctly, terminal finalization remains guarded, rollback behavior remains intact, and disposable database cleanup was verified. A canonical `collectEndpoint()` database test proved returned mixed-batch accounting and real run provenance match the persisted Collection run. Phase 6 has no Article table or Article persistence.

## Approved live-source observations — Level 7

The successful repository-owner VPS command was:

```text
npm run test:live-sources
```

The suite used the canonical live-source harness: a disposable PostgreSQL database, production migrations/bootstrap, production resolver/network safety, HTTP/redirect handling, parser, normalizer, Article-link policy, Collection-run persistence, and the manual Worker collection command. Both configured approved endpoints were exercised independently. The terminal result was `1/1` live test passed, `0` failed, `0` skipped, in approximately `10.7 s` total.

### Author Media — observed green on VPS

- Configuration: Publication `indie-author-publishing-news`; Source `author_media`; endpoint `site_rss`; approved URL `https://www.authormedia.com/feed/`.
- Both Worker executions returned HTTP `200` with transport/parser/normalization `succeeded`, `0` redirects, `21,684` wire bytes, and `138,079` decompressed bytes.
- Each run produced `100` Raw items, `100` normalized candidates, `0` normalization failures, and `0` Article-link rejections.
- Persisted Collection-run IDs: `468b9103-c995-4067-97bc-a226866f506c` and `77e463da-c9b2-451a-802c-265cf4cb488d`.
- Bounded candidate evidence included `SEO for Author Websites: The Only Guide You Need in 2026`, original/canonical publisher URL on `www.authormedia.com`, parsed publication date `2026-08-05T07:02:00.000Z`, and matching Publication/Source/endpoint/run provenance.
- First transport elapsed approximately `2.91 s`; second approximately `0.05 s`.

### The Creative Penn — observed green on VPS

- Configuration: Publication `indie-author-publishing-news`; Source `the_creative_penn`; endpoint `podcast_rss`; approved URL `https://www.thecreativepenn.com/feed/podcast/`.
- Both Worker executions returned HTTP `200` with transport/parser/normalization `succeeded`, `0` redirects, `4,727,916` wire bytes, and `15,837,237` decompressed bytes.
- Each run produced `300` Raw items, `300` normalized candidates, `0` normalization failures, and `0` Article-link rejections.
- Persisted Collection-run IDs: `e96811b5-0bd3-41f1-9177-8eb9277d1908` and `dd7d58a5-436b-4e6c-8e4c-5d2bcf734bc2`.
- Bounded candidate evidence included `From Blog To Community To Book: A Non-Fiction Author’s Journey With Suzanne Smith`, original/canonical publisher URL on `www.thecreativepenn.com`, parsed publication date `2026-08-05T06:30:00.000Z`, and matching Publication/Source/endpoint/run provenance.
- First transport elapsed approximately `4.42 s`; second approximately `0.19 s`, both below the unchanged production `15 s` total deadline.

### Environment caveat retained

Earlier local Windows validation over a throttled phone hotspot repeatedly caused The Creative Penn transport to reach the production `15 s` total deadline after HTTP `200`; those attempts truthfully persisted transport failure with parser/normalization `not_run`. The later VPS success shows that this observed local failure was environment-sensitive and is not evidence requiring a production timeout change. The failed local observations remain part of the evidence history rather than being erased.

## Scope and preserved behavior inspection — Levels 0 and 1

The accepted tree keeps normalization generic and topic-independent; parser Raw items remain separate from Article candidates; original destinations remain distinct from canonical identity URLs; Article-link policy remains a separate non-network post-normalization gate; and the Worker remains the sole collection owner with no Web/API inline fetch path.

No Phase 7 Relevance implementation, Article schema/persistence/observations, identity/concurrency, post-identity counters, duplicate machinery, public/admin feed UI/API, scheduler/jobs/health, HTML/custom/browser collector, topic-specific exception, or automatic Source/domain discovery/widening was introduced. Existing Web/Worker health and lifecycle, configuration ownership/bootstrap, migration history, Phase 4 safety/locking, Phase 5 transport/parser limits, Collection-run provenance/finalization, failure isolation, and deterministic no-public-network regression behavior remained green.

## Exit-gate mapping and handoff

1. Same Raw item produces deterministic normalized output: **green** at Levels 2 and 5.
2. Unsafe/out-of-policy Article destinations are rejected before persistence: **green** at Levels 2, 3, and 5.
3. Real approved Source entries are inspectable as normalized candidates with endpoint/run provenance: **green** at Level 7 for both Author Media and The Creative Penn on the repository-owner VPS.
4. Normalization fixture coverage includes malformed, boundary, URL, date, markup, and determinism cases: **green** at Levels 2 and 5.

Persisted normalization accounting is green at Level 4 and matches Worker results. No known skipped/flaky substitute hides required behavior. No later-phase scope leak is known. No `package-lock.json` was created.

Level 6 browser validation was not required or claimed. Level 8 reference-deployment validation was not required or claimed; running Level 7 from the VPS is not treated as deployment proof.

**Phase 6 exit gate is satisfied. Conversational `/closeout` may now run its normal structural check and, if no post-validation executable drift is present, transition the project to the Phase 7 baseline.**
