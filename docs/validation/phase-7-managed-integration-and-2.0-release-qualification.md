# Phase 7 — Managed integration and 2.0 release qualification

## Result and identity

- Status: **OWNER ACCEPTED — TERMINAL 2.0.0 RELEASE AUTHORIZED WITH DOCUMENTED EVIDENCE EXCEPTION**.
- Repository observed before this acceptance on 2026-08-27 at `main` commit `08dd1f7429c1221d2d5b6bec07af29fe69a886f6` (`Fix PHP fallback date presentation`), package version `1.7.0`.
- The normal written Phase 7 P1–P4 qualification sequence was not executed on the observed committed tree.
- On 2026-08-27 the repository owner/operator explicitly confirmed that the deployed customer integration is good and explicitly authorized proceeding to the terminal **`2.0.0`** transition despite the omitted formal Phase 7 evidence sequence.
- This is an intentional owner-approved release-gate exception. It must not be represented later as evidence that unexecuted tests or failure scenarios passed.

## Customer integration milestone

The generic PHP integration package has been installed into the real customer website at:

`https://michael-finney.com/indie-author-publishing-news.php`

The repository owner/operator reports that the integration is functioning correctly in production and accepts that real customer deployment as sufficient practical release confidence for the terminal transition.

This establishes the product milestone that motivated Phase 7: News Scraper is supplying its PHP integration to a genuinely external customer site that renders the integrated news feed.

## Owner-approved qualification exception

The governing Phase 7 roadmap normally calls for:

1. P1 — managed integration qualification plane (`1.7.1`);
2. P2 — managed News Scraper release qualification (`1.7.2`);
3. P3 — external PHP end-to-end release qualification (`1.7.3`);
4. deployment/installation of the exact committed P3 behavior candidate;
5. P4 — independent Phase 7 closeout (`1.7.4` candidate) with the full managed/external evidence matrix.

That normal sequence was deliberately waived by the owner/operator for this release after the successful real customer integration.

The waiver is limited to release qualification/evidence. It does not alter the Project Contract's product laws, topic independence, Source trust, canonical eligibility, Profile semantics, machine/admin separation, LKG architecture, publisher-destination rule, production-data durability, or any runtime behavior.

## Evidence classification

### Accepted practical evidence

- A real customer PHP site exists outside the managed News Scraper deployment.
- The generic PHP integration package has been installed there.
- The repository owner/operator reports that the integration is functioning correctly in production.
- The repository owner/operator explicitly accepts the current product state for the `2.0.0` release transition.

### Historical automated evidence retained from prior phases

Earlier Phase 1–6 validation artifacts remain authoritative only for the exact trees/environments they recorded. In particular, Phase 5 established the generic PHP synchronization/LKG behavior and Phase 6 established the local-read/server-rendered customer integration behavior in their recorded test environments. Those artifacts are not rewritten by this exception.

### Not claimed as executed for Phase 7

This artifact does **not** claim that the following Phase 7-specific evidence was executed against an exact P3 candidate:

- P1 restricted remote-validator protocol/bundle qualification;
- P2 managed production qualification;
- P3 exact external-host qualification;
- Level 7/8 managed/external failure injection;
- exact deployed News Scraper SHA ↔ external installed PHP source identity matching;
- deliberate upstream/API outage testing;
- malformed/incomplete candidate injection;
- live snapshot-revision-change injection;
- live stale-cutoff/disable/re-enable scenario execution;
- live credential-revocation/rate-limit scenario execution;
- a final P4 automated/database/security/browser/recovery rerun.

These omissions are accepted release risks, not passing test results.

## Release decision

The repository owner/operator has reviewed the practical deployment state and accepts the remaining qualification risk.

**Release decision: ACCEPTED FOR TERMINAL 2.0.0 TRANSITION.**

The next conversational `/closeout` may therefore perform the roadmap's terminal release transition from the current accepted `1.7.0` product tree to `2.0.0`, subject to its normal repository-drift and version-only safety checks.

The transition must remain version-only:

```text
accepted 1.7.0 product tree
-> package.json version only
-> 2.0.0
```

No `1.8.0` baseline is created. No `2.0.x` development candidate is created. No source, schema, dependency, configuration, or runtime behavior change is authorized as part of the terminal version transition.

## Audit note

This artifact intentionally distinguishes **owner release acceptance** from **executed technical validation**. Future documentation must preserve that distinction. The `2.0.0` release may be described as owner-accepted following successful real customer integration, but must not claim the omitted Phase 7 P1–P4 evidence matrix was executed or green.
