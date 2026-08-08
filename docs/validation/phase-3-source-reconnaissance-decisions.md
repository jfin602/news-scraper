# Phase 3 Source Reconnaissance Decisions and Issues

## Purpose

This document is the decision-and-issues companion to `docs/validation/phase-3-source-reconnaissance.md`.

It records the current interpretation of the reconnaissance results for Phase 3 planning and for reporting findings back to the customer. It does not replace the reconnaissance evidence, redefine project contracts, or by itself authorize Source or endpoint approval in bootstrap data.

Actual Phase 3 bootstrap approval remains a deliberate repository-owner decision under `docs/contracts/source-and-collection-contract.md`.

## Evidence Basis

- Reconnaissance artifact: `docs/validation/phase-3-source-reconnaissance.md`
- Reconnaissance source tree: `8aabc08a710d7bed237dcc02b38592db23300e66`
- Reconnaissance artifact commit: `ecc72e222e23655199ee8fc55b4d19981ca7ff6c`
- Initial candidates investigated: 6
- Technically verified `rss_atom` endpoints currently suitable as Phase 3 bootstrap candidates: 2

## Executive Decision Summary

| Source | Current planning position | Main reason | Follow-up |
| --- | --- | --- | --- |
| Author Media | RECOMMEND FOR MVP WITH CAVEAT | Reliable first-party RSS with publisher-owned article links, but the usable feed is broader than Author Update | Use the publisher as the Source identity; document feed breadth |
| The Creative Penn | RECOMMEND FOR MVP WITH CAVEAT | Reliable first-party podcast RSS with publisher-hosted show-notes links, but editorial scope is broader than pure industry news | Use the publisher as the Source identity and podcast RSS as its endpoint |
| Jane Friedman | WITHHOLD FROM INITIAL MVP | The customer's label does not map cleanly to the authoritative industry-reporting channel; the best-matching reporting product is paid and the public Substack is a different channel | Reconsider if a suitable public industry-reporting feed or authorized syndication route becomes available |
| Authors Publish | HOLD PENDING TARGETED FOLLOW-UP | Whole-site RSS is too opportunity-heavy, but an existing Publishing Industry News archive means the narrow-feed question is not fully settled | Directly verify the Publishing Industry News category/feed path before final exclusion |
| Sub Club | WITHHOLD FROM INITIAL MVP | Technically easy RSS, but editorial output is jobs, pitches, agents, and submissions rather than publishing-industry news | Reconsider only for a separately scoped opportunities Publication |
| Upstream Reviews | WITHHOLD FROM INITIAL MVP | Technically easy RSS, but editorial output is reviews and entertainment podcasts rather than publishing-industry news | Reconsider only for a separately scoped reviews/discovery Publication |

## Decisions and Planning Positions

### D1 - Author Media is a viable initial MVP Source candidate

Current position: **Recommend for MVP with caveat.**

Verified endpoint:

`https://www.authormedia.com/feed/`

The feed is first-party RSS 2.0 and observed entries link back to public Author Media article pages. This preserves the original-publisher destination requirement.

The caveat is editorial scope. The verified feed is the whole Author Media site feed, not a dedicated Author Update feed. The recon tested the inferred Author Update category feed and did not verify a usable RSS endpoint for that narrower channel.

Planning consequence:

- Persist the Source identity as **Author Media**, not `Author Media - Author Update`.
- Use `author_media` as the proposed stable Source `config_key`.
- Use `site_rss` as the proposed endpoint `config_key`.
- Use exact host `www.authormedia.com` as the proposed Source maximum domain rule.
- Proposed endpoint URL: `https://www.authormedia.com/feed/`.
- Proposed endpoint type: `rss_atom`.
- Proposed polling interval: `21600` seconds.
- Do not widen the Source boundary to Buzzsprout merely to use the podcast feed.

Customer-facing explanation:

Author Media can be included immediately through a reliable first-party RSS feed, but the available feed contains broader author education and marketing content in addition to the requested Author Update reporting. The system can collect it safely now, while later Publication-owned relevance rules can decide which items belong in the final news feed.

### D2 - The Creative Penn is a viable initial MVP Source candidate

Current position: **Recommend for MVP with caveat.**

Verified endpoint:

`https://www.thecreativepenn.com/feed/podcast/`

The feed is first-party RSS 2.0 and observed entries link to public `thecreativepenn.com` show-notes/article pages. Audio enclosures are supplementary rather than the preferred public destination.

The caveat is editorial scope. The feed is primarily an author-business/interview podcast rather than a dedicated publishing-news desk.

Planning consequence:

- Persist the Source identity as **The Creative Penn**.
- Treat the podcast as the Source endpoint, not as a separate publisher identity.
- Use `the_creative_penn` as the proposed stable Source `config_key`.
- Use `podcast_rss` as the proposed endpoint `config_key`.
- Use exact host `www.thecreativepenn.com` as the proposed Source maximum domain rule.
- Proposed endpoint URL: `https://www.thecreativepenn.com/feed/podcast/`.
- Proposed endpoint type: `rss_atom`.
- Proposed polling interval: `21600` seconds.

Customer-facing explanation:

The Creative Penn has a clean, publisher-owned RSS feed with reliable episode metadata and links back to public publisher pages. It is technically one of the strongest initial sources, although some episodes will be author-business or interview material rather than direct industry news.

### D3 - Jane Friedman should be withheld from the initial MVP

Current position: **Withhold from the initial MVP.**

The key issue is not simply that some material is paid. A paywall alone does not necessarily make a source unusable for News Scraper because the product is designed to link readers to the original publisher rather than reproduce full articles.

The stronger issue is channel mismatch:

- The customer's label was `Jane Friedman's Substack`.
- The inspected Substack is a distinct personal/advice channel rather than the authoritative publishing-industry reporting product.
- The authoritative industry-reporting product is The Bottom Line.
- The available public site feed is mixed and includes premium items, while no clean public structured endpoint was verified that corresponds directly to the desired industry-reporting stream.

Planning consequence:

- Do not create a Phase 3 bootstrap Source for Jane Friedman yet.
- Do not merge `janefriedman.com` and `janefriedman.substack.com` into one approved-domain boundary.
- Do not attempt authentication, subscription access, paywall bypass, email-account ingestion, or browser automation for the MVP.

Customer-facing explanation:

Jane Friedman remains a valuable editorial source, but the public machine-readable channels do not cleanly match the specific industry-reporting product the customer appears to want. It is safer to withhold it from the first automated source set than to ingest the wrong Jane Friedman channel or blur paid and public content boundaries.

### D4 - Authors Publish should not be considered finally rejected yet

Current position: **Hold pending targeted follow-up.**

The recon correctly established that the verified whole-site RSS feed is dominated by submissions, contests, literary magazines, and publisher opportunities. That feed is not a good match for the initial publishing-industry-news Publication.

However, the Source has a first-party **Publishing Industry News** archive. The reconnaissance did not fully settle whether that narrower section exposes a usable structured feed.

This is the main open recon issue.

Planning consequence:

- Do not use the broad `https://authorspublish.com/feed/` endpoint for the initial Publication.
- Do not permanently classify Authors Publish as unsuitable until the narrow Publishing Industry News category/feed path is directly tested.
- A targeted follow-up should verify the category page and any RSS/Atom endpoint exposed or conventionally mapped from it.
- If a working narrow RSS/Atom feed is verified and its recent items are genuinely industry-news focused, Authors Publish may become a third initial MVP Source candidate.
- If no suitable structured feed exists, withhold it from the initial MVP rather than front-loading Phase 18 HTML collection.

Customer-facing explanation:

Authors Publish as a whole is too focused on submission opportunities for this news product, but it appears to maintain a narrower Publishing Industry News section. We want to verify whether that section has its own reliable feed before making the final inclusion decision.

### D5 - Sub Club should be withheld from the initial publishing-industry Publication

Current position: **Withhold from the initial MVP.**

Its Substack RSS is technically straightforward and well-structured, but the observed editorial product centers on jobs, pitches, agents, submission calls, and opportunities.

This is an editorial-fit decision, not a technical collection failure.

Planning consequence:

- Do not bootstrap Sub Club into the initial publishing-industry Publication.
- Do not broaden Relevance behavior merely to rescue a fundamentally different content stream.
- Preserve it as a candidate for a future opportunities-oriented Publication if that product is desired.

Customer-facing explanation:

Sub Club is easy to collect technically, but it is primarily an opportunities feed rather than an industry-news feed. It would add significant noise to the current product, so it is better reserved for a separately scoped opportunities product.

### D6 - Upstream Reviews should be withheld from the initial publishing-industry Publication

Current position: **Withhold from the initial MVP.**

Its Substack RSS is technically straightforward, but the observed publication is centered on genre book reviews, video reviews, and entertainment podcasts.

This is an editorial-fit decision, not a technical collection failure.

Planning consequence:

- Do not bootstrap Upstream Reviews into the initial publishing-industry Publication.
- Preserve it only as a possible future Source for a separately scoped reviews/discovery Publication.

Customer-facing explanation:

Upstream Reviews has a usable feed, but its actual output is reviews and entertainment content rather than publishing-industry reporting. Including it would dilute the purpose of the initial news product.

## Issues Requiring Follow-up

### I1 - Authors Publish narrow-feed verification

Priority: **High before final Source-set freeze; not required to begin Phase 3 core implementation planning.**

Required follow-up:

1. Open the first-party Publishing Industry News archive directly.
2. Inspect page metadata for RSS/Atom alternates.
3. Test any explicit or inferred category-feed endpoint directly.
4. Confirm HTTP result, final URL, feed type, recent items, and item destinations.
5. Compare its editorial scope with the already rejected whole-site feed.
6. If technically and editorially suitable, propose exact-host Phase 3 configuration.

Expected result:

- Either promote Authors Publish to a third `rss_atom` bootstrap candidate, or
- confirm the current withholding without requiring HTML collection in Phase 3.

### I2 - Author Media source naming must reflect the actual collected boundary

The customer supplied `Author Media - Author Update`, but the selected endpoint is the publisher-wide Author Media RSS feed.

The persisted Source should therefore be **Author Media**. `Author Update` is a content subsection observed within that Source, not the technical collection boundary currently selected.

This prevents the configuration from claiming a narrower Source scope than the endpoint actually provides.

### I3 - The Creative Penn source identity and endpoint identity must remain separate

The Source is **The Creative Penn**.

The selected endpoint is its podcast RSS feed.

Do not encode the podcast as if it were a separate publisher unless later evidence establishes a true provenance boundary requiring that split.

### I4 - Jane Friedman withholding must not be described as a blanket paywall prohibition

News Scraper's public destination is the publisher's original page. Therefore, a public feed item that links to a premium destination could potentially be valid in a future configuration.

The present withholding decision is narrower:

- no clean public structured channel was verified that corresponds to the customer's intended industry-reporting stream;
- the public Substack is a different editorial channel;
- the main-site feed is mixed and not an adequate substitute for The Bottom Line.

This distinction should be preserved in customer communication and future planning.

### I5 - Source quality and transport quality are separate decisions

The recon demonstrated that several withheld Sources have technically good RSS feeds.

They are withheld because their editorial products do not match the current Publication, not because News Scraper cannot collect them.

This distinction is important for future reuse of the Platform:

- Sub Club may fit an opportunities Publication.
- Authors Publish may fit an opportunities Publication if the narrow news feed is not viable.
- Upstream Reviews may fit a reviews/discovery Publication.

The shared engine must not hard-code these editorial judgments.

## Current Recommended Initial Source Set

Subject to explicit repository-owner bootstrap approval, the current recommended minimum Phase 3 Source set is:

1. **Author Media**
   - Endpoint: `https://www.authormedia.com/feed/`
   - Type: `rss_atom`
   - Exact approved host: `www.authormedia.com`
   - Poll interval: `21600`
   - Status: recommended with editorial-scope caveat

2. **The Creative Penn**
   - Endpoint: `https://www.thecreativepenn.com/feed/podcast/`
   - Type: `rss_atom`
   - Exact approved host: `www.thecreativepenn.com`
   - Poll interval: `21600`
   - Status: recommended with editorial-scope caveat

This set is sufficient to satisfy the Phase 3 technical requirement that at least two real `rss_atom` endpoints can be configured, assuming the repository owner explicitly approves them as bootstrap configuration.

Authors Publish remains a possible third Source pending the targeted follow-up above.

## Customer Report Summary

The six supplied candidates break into three groups:

### Ready enough for the first MVP

**Author Media** and **The Creative Penn** both expose reliable first-party RSS feeds that can be integrated without scraping or browser automation. Both are broader than a pure industry-news wire, so they should be included with the expectation that later Publication-owned relevance rules will determine which collected items appear publicly.

### Valuable but not ready for this automated MVP feed

**Jane Friedman** is highly relevant editorially, but the public structured channels inspected do not cleanly represent the industry-reporting product the customer appears to mean. It should be revisited if a suitable public feed or authorized syndication path becomes available.

**Authors Publish** is not yet a final rejection. Its general feed is too opportunity-heavy, but a narrower Publishing Industry News section exists and deserves one targeted feed-verification pass.

### Technically collectable but wrong product fit

**Sub Club** and **Upstream Reviews** both have technically usable feeds, but their editorial focus does not match the current publishing-industry-news Publication. They are better candidates for separate future products rather than sources for this feed.

## Phase 3 Planning Impact

- The Phase 3 P1-P6 task boundary does not need to change.
- Core Phase 3 planning can proceed because two real structured endpoint candidates are already verified.
- The Authors Publish follow-up can run in parallel and may improve the seed set without changing the architecture.
- No Source-specific adapter is currently required.
- No HTML collector should be introduced in Phase 3.
- No paywall bypass, authenticated collection, or browser automation should be introduced.
- The initial Source data must remain Publication-owned bootstrap configuration rather than shared-engine logic.

## Decision Status

This document records the current engineering recommendation and the issues that should be communicated to the customer.

It does **not** itself convert recommended Sources into approved bootstrap configuration.

Before the Phase 3 bootstrap-data task is finalized, the repository owner must explicitly accept or reject the proposed initial Source set. Any later Authors Publish promotion likewise requires explicit approval after its narrow-feed reconnaissance is complete.
