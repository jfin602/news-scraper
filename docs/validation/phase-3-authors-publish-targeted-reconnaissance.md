# Phase 3 Authors Publish Targeted Reconnaissance

## Evidence Metadata

- Reconnaissance date: 2026-08-07
- Reconnaissance time: 22:07 CDT (UTC-05:00)
- Repository HEAD SHA inspected: `ecc72e222e23655199ee8fc55b4d19981ca7ff6c`
- Original recon artifact consulted: `docs/validation/phase-3-source-reconnaissance.md`
- Decisions artifact consulted: `docs/validation/phase-3-source-reconnaissance-decisions.md` was requested but was absent from the inspected source tree.
- Tooling used: Codex in-app Browser for the archive and its page metadata; `Invoke-WebRequest` for public HTTP/XML response, headers, and XML inspection after the in-app Browser blocked direct XML navigation with `net::ERR_BLOCKED_BY_CLIENT`.
- Evidence limitations: this is a point-in-time inspection of public endpoints. Browser XML rendering was unavailable, no private/paid content was accessed, and no Phase 4 network-safety behavior was tested or implemented.
- This artifact was collected after the original six-source reconnaissance. It records evidence and a technical recommendation only; it does not approve Authors Publish or authorize bootstrap states.

## Question Being Resolved

Whether the Authors Publish Publishing Industry News section exposes a viable first-party RSS/Atom feed suitable for the initial MVP.

## Previous Finding

The original reconnaissance verified the whole-site RSS feed at `https://authorspublish.com/feed/`, but found it heavily weighted toward submissions, contests, literary magazines, and publishing opportunities. It withheld Authors Publish from the initial MVP and noted that a cleaner Publishing Industry News route would need verification.

## Publishing Industry News Archive Verification

- Requested URL: `https://authorspublish.com/category/publishing-news/`
- Final URL: unchanged
- Result: VERIFIED first-party HTML archive, titled `» Publishing Industry News` and headed `Publishing Industry News`.
- Recent archive evidence: the newest six entries are monthly `Notes from the Editor’s Desk` posts dated October through May 2025. Their summaries mix industry developments with opportunities: October begins with writer opportunities; September advertises writing grants and eight submission calls; August combines the Hugo Awards and Authors Guild grant news with three publishing opportunities; July combines book-sales/layoff news with five submission calls; June combines royalty delays with funding and five submission calls; May combines Authors Guild/AI news with opportunities and editing jobs.
- Editorial-fit assessment: the archive is narrower than the whole site and does contain publishing-business, copyright/AI, royalty, sales, and publisher-closure topics, but every current sample is a mixed monthly roundup rather than a focused current industry-news item. Its latest item is 2025-10-23, about 288 days before this reconnaissance.

## Feed Discovery Evidence

- VERIFIED: the archive document exposes `rel="alternate"`, type `application/rss+xml`, title `Authors Publish Magazine » Publishing Industry News Category Feed`, URL `https://authorspublish.com/category/publishing-news/feed/`.
- VERIFIED: the explicitly exposed category-feed URL above was directly tested. It was initially a WordPress-style inference, then verified from page metadata and the HTTP/XML response.
- UNVERIFIED: the JSON category link exposed alongside it was not tested because it is not an RSS/Atom endpoint and no additional structured endpoint was needed to resolve the question.

## Candidate Feed Verification

- Tested URL: `https://authorspublish.com/category/publishing-news/feed/`
  - Final URL: unchanged; no redirect observed.
  - HTTP outcome: 200 OK.
  - Content-Type: `application/rss+xml; charset=UTF-8`.
  - Feed type: RSS 2.0.
  - Feed title: `Publishing Industry News – Authors Publish Magazine`.
  - Approximate retained items: 14.
  - Result: VERIFIED as a technically valid first-party RSS feed, but not viable for the initial MVP’s editorial/freshness requirements.

## Recent Feed Item Evidence

- `Notes from the Editor’s Desk: October 2025` — 2025-10-23 — `https://authorspublish.com/notes-from-the-editors-desk-october-2025/` — categories include `Publishing Industry News`; GUID, author (`Caitlin Jans`), timestamp, categories, excerpt, and primary URL are present. Classification: mixed publishing/news/opportunities roundup.
- `Notes from the Editor’s Desk: September 2025` — 2025-09-25 — `https://authorspublish.com/notes-from-the-editors-desk-september-2025/` — categories include `Publishing Industry News`; stable WordPress GUID and the same core metadata are present. Classification: publishing contracts plus grants and submission opportunities.
- `Notes from the Editor’s Desk: August 2025` — 2025-08-28 — `https://authorspublish.com/notes-from-the-editors-desk-august-2025/` — categories include `Publishing Industry News`; stable WordPress GUID and the same core metadata are present. Classification: publishing/author-organization news plus opportunities.
- The next three sampled items (July, June, and May 2025) follow the same monthly-roundup pattern and are all substantially stale at the observation time.

## Original Destination Verification

The three sampled item URLs remained on exact host `authorspublish.com`, returned 200 HTML, and did not redirect to a third party, tracking host, newsletter mirror, or unrelated publisher. The feed therefore satisfies the original-publisher destination requirement.

## Narrow Feed vs Whole-Site Feed

| Attribute | Publishing Industry News Feed | Whole-Site Feed |
| --- | --- | --- |
| Structured feed works | Yes: verified RSS 2.0, 200 | Yes: verified RSS 2.0, 200 |
| Industry-news focus | Some industry topics, but bundled with opportunities; latest item 2025-10-23 | Predominantly submissions, calls, contests, and author advice; current through 2026-08-06 |
| Submission/opportunity noise | Reduced only partially; present in each sampled roundup | Very high |
| Publisher-owned item links | Yes, exact `authorspublish.com` | Yes, exact `authorspublish.com` |
| Metadata quality | Comparable: GUID, title, date, author, categories, excerpt, URL | Comparable WordPress metadata |
| MVP suitability | No: stale and materially mixed | No: current but overwhelmingly opportunity-oriented |

The narrow feed is technically cleaner than the whole-site feed, but it does not remove enough opportunity noise and has not been updated since October 2025. Selecting it would still require accepting a stale, mixed stream rather than avoiding dependence on later relevance filtering.

## Proposed Domain Policy

NONE PROPOSED. A technically narrow exact-host policy is possible (`authorspublish.com`, no subdomains), but it is inappropriate to propose bootstrap configuration for an editorially unsuitable and stale endpoint.

## Proposed Phase 3 Configuration

- source_name: NONE
- source_config_key: NONE
- source_site_url: NONE
- source_approved_hostname_rules: NONE
- source_subdomains_allowed: NONE
- endpoint_config_key: NONE
- endpoint_type: NONE
- endpoint_url: NONE
- endpoint_narrowing: NONE
- poll_interval_seconds: NONE
- recommended_initial_approval_state: NONE
- recommended_initial_lifecycle_state: NONE
- recommended_initial_operational_state: NONE

## Final Technical Recommendation

CONFIRM_WITHHOLD_FROM_MVP

## Reason

The dedicated endpoint is directly verified RSS and preserves Authors Publish destinations, but the latest retained item is roughly 9.5 months old and the sampled monthly posts still mix industry developments with grants, submission calls, and other opportunities. It fails the required current, materially focused industry-news fit; technical collectability does not overcome that editorial/freshness mismatch.

## Customer-Facing Summary

Authors Publish does have a clean, first-party feed for its Publishing Industry News archive, so no scraping or custom adapter would be needed technically. However, the feed stopped updating in October 2025 and its posts still combine news with publishing opportunities. The broad feed remains much noisier and current; the narrower feed does not solve the MVP problem. A future opportunities-oriented Publication or later editorial decision could revisit it, but HTML scraping is neither needed nor justified here.

## Phase 3 Planning Impact

1. Should Authors Publish be added to the proposed Phase 3 bootstrap candidate set? No.
2. If yes, what exact endpoint should be used? Not applicable; no endpoint is proposed.
3. If no, is the reason technical, editorial, or both? Editorial and freshness; not a technical RSS failure.
4. Does this alter the existing Phase 3 P1-P6 boundaries? No.
5. Does this block `/prompt-plan`? At the time of this reconnaissance, no; the existing two technically verified, caveated candidates were sufficient for planning pending owner acceptance. That owner acceptance was subsequently granted as recorded below.
6. What explicit owner decision remains? At the time of this reconnaissance, approval of the Author Media and The Creative Penn bootstrap proposals remained. That decision was subsequently resolved as recorded below; no Authors Publish approval decision was requested.

## Subsequent Operator Decision

- Decision date/time: 2026-08-07 22:22 CDT (UTC-05:00).
- The repository owner explicitly approved Author Media and The Creative Penn as the initial Phase 3 bootstrap Source set.
- Authors Publish remains withheld from the initial bootstrap set in accordance with this targeted reconnaissance.
- `/prompt-plan` is unblocked by Source approval.
- This subsequent operator decision does not alter the point-in-time technical evidence above.

## Evidence Limitations

- The Browser directly verified the archive and exposed RSS metadata, but its XML navigation was blocked by a client rule; direct public HTTP/XML inspection supplied the feed response evidence.
- The 14 retained feed items establish observed retention, not a contractual retention guarantee.
- Editorial output and endpoint behavior are time-sensitive. This evidence does not approve a Source, test runtime safety, or weaken Phase 4/5/10/18 boundaries.
- The requested companion decisions artifact did not exist in the inspected repository at reconnaissance time, so it could not be updated during that task. It was subsequently restored/merged and reconciled after the operator decision.