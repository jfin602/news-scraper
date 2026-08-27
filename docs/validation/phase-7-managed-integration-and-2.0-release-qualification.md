# Phase 7 — Managed integration and 2.0 release qualification

## Result and identity

- Status: **BLOCKED — PRELIMINARY CUSTOMER INTEGRATION OBSERVATION ONLY**.
- Repository observed on 2026-08-27 at `main` commit `08dd1f7429c1221d2d5b6bec07af29fe69a886f6` (`Fix PHP fallback date presentation`).
- Observed package version: `1.7.0`.
- Required Phase 7 implementation sequence has **not** been completed on the observed committed tree: no runner-created P1 (`1.7.1`), P2 (`1.7.2`), or P3 (`1.7.3`) implementation commits are present after the `1.7.0` baseline.
- This artifact therefore does **not** satisfy the Phase 7 release gate and does **not** authorize the terminal `/closeout` transition to `2.0.0`.

## Customer integration milestone

On 2026-08-27 the repository owner reported that the generic PHP integration package was successfully installed into the real customer website at:

`https://michael-finney.com/indie-author-publishing-news.php`

The owner reports that this is the first real customer-site integration of the package and that the page is functioning in production.

This is an important Phase 7 prerequisite and establishes that a genuinely external customer PHP site now exists for final release qualification. It does not, by itself, prove the complete Phase 7 evidence matrix or bind the observed customer runtime to an exact final committed P3 candidate.

## Why release closeout is currently blocked

The governing Phase 7 roadmap requires the final release artifact to be tied to the exact committed final `1.7.x` candidate and to record applicable automated, real-PostgreSQL, security, browser/server, approved-live-Source, managed-deployment, failure-injection, migration, recovery, and external-host evidence.

The written Phase 7 task stack requires:

1. P1 — managed integration qualification plane (`1.7.1`);
2. P2 — managed News Scraper release qualification (`1.7.2`);
3. P3 — external PHP end-to-end release qualification (`1.7.3`);
4. deployment/installation of the exact committed P3 behavior candidate to the managed News Scraper instance and external PHP host;
5. P4 — independent Phase 7 closeout (`1.7.4` candidate) against those exact identities.

The observed `main` tree is still the `1.7.0` Phase 7 baseline, so the required exact-candidate identity chain does not yet exist.

## Evidence still required before GREEN

Final Phase 7 closeout must execute and record, at the appropriate evidence level, the contracted real-path and failure/recovery matrix, including at minimum:

- real approved-Source collection through canonical eligibility and Profile selection;
- dedicated machine authentication and genuine v1 API pagination/revision behavior;
- complete external PHP synchronization and validated atomic LKG activation;
- customer server-rendered output with exact direct stored publisher `originalUrl` destinations;
- proof that ordinary visitor rendering performs no live News Scraper API request;
- upstream/API unavailability while valid LKG remains usable;
- synchronization failure without corrupting/replacing active LKG;
- malformed/incomplete candidate rejection;
- snapshot revision change during traversal;
- stale-valid cache behavior and configured stale cutoff where applicable;
- authoritative Profile disable suppressing cached rendering and later successful re-enable restoration;
- invalid/revoked credential behavior;
- rate-limit / `Retry-After` behavior;
- preserved `GET /` and `GET /api/feed` behavior;
- supported production-forward migration/data preservation for all 2.0 schema additions;
- backup/restore/rollback compatibility;
- bounded operational telemetry without credential/secret leakage;
- restricted managed/external validation transport and exact installed/deployed candidate identity where required by the Phase 7 prompts.

## Evidence classification

### Observed / owner-reported

- A real customer PHP site exists outside the managed News Scraper deployment.
- The owner reports that the PHP integration package has been installed and is functioning at the customer URL above.

### Not established by this artifact

- exact deployed News Scraper SHA;
- exact installed external PHP package/source SHA/version identity;
- P1 validator protocol/bundle identity;
- P2 managed qualification results;
- P3 external end-to-end qualification results;
- Level 7/8 managed/external failure-injection evidence;
- final automated/database/security/browser/recovery reruns against an exact P3 candidate;
- a green P4 closeout conclusion.

Owner report is recorded as deployment context, not substituted for executed release evidence.

## Terminal transition gate

The terminal release transition remains:

```text
final validated 1.7.x candidate
-> package.json version only
-> 2.0.0
```

No `1.8.0` or `2.0.x` development baseline is created.

Before conversational `/closeout` may perform that transition, this preliminary artifact must be replaced or updated by the real P4 closeout artifact with **Phase 7 GREEN — HUMAN REVIEW REQUIRED** status, exact final candidate identity, and the required executed evidence.

Until then, `/closeout` must fail closed rather than advancing the package version.
