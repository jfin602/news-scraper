# Phase 3 Source Reconnaissance Decisions and Issues

## Purpose

This document is the decision-and-issues companion to:

- `docs/validation/phase-3-source-reconnaissance.md`
- `docs/validation/phase-3-authors-publish-targeted-reconnaissance.md`

It records the current repository-owner decisions derived from those reconnaissance artifacts for Phase 3 planning and for reporting findings back to the customer.

It does not redefine project contracts. Bootstrap implementation must still obey `docs/contracts/source-and-collection-contract.md`.

## Evidence Basis

- Original six-source reconnaissance source tree: `8aabc08a710d7bed237dcc02b38592db23300e66`
- Original reconnaissance artifact commit: `ecc72e222e23655199ee8fc55b4d19981ca7ff6c`
- Authors Publish targeted follow-up source tree: `ecc72e222e23655199ee8fc55b4d19981ca7ff6c`
- Initial customer candidates investigated: 6
- Technically verified `rss_atom` endpoints suitable for the initial Phase 3 bootstrap: 2
- Explicit bootstrap-set approval: 2026-08-07 22:22 CDT (UTC-05:00)

## Final Bootstrap Decision

The repository owner explicitly approves the following two Sources for the initial Phase 3 bootstrap configuration:

1. **Author Media**
2. **The Creative Penn**

The following four Sources are explicitly withheld from the initial bootstrap configuration:

1. Jane Friedman
2. Authors Publish
3. Sub Club
4. Upstream Reviews

This approval is deliberate operator approval under the Source and Collection Contract. It authorizes Phase 3 bootstrap data to create the two approved Source/endpoint pairs with approval state `approved`, lifecycle state `active`, and operational state `enabled` when absent.

It does not authorize:

- implicit bootstrap during Web/API or Worker startup;
- Source discovery or auto-approval;
- approval inferred from fetch success;
- silent domain widening;
- overwriting later operator-managed configuration;
- Phase 4 network-safety behavior to be skipped;
- Phase 5 transport/parser behavior to be implemented early;
- Publication-specific rules to enter shared engine logic.

## Executive Decision Summary

| Source | Final Phase 3 position | Main reason | Bootstrap status |
| --- | --- | --- | --- |
| Author Media | APPROVE WITH CAVEAT | Reliable first-party RSS with publisher-owned article links; selected feed is broader than Author Update | APPROVED |
| The Creative Penn | APPROVE WITH CAVEAT | Reliable first-party podcast RSS with publisher-hosted show-notes links; editorial scope is broader than pure industry news | APPROVED |
| Jane Friedman | WITHHOLD FROM INITIAL MVP | Public structured channels do not cleanly represent the industry-reporting product the customer appears to mean | WITHHELD |
| Authors Publish | WITHHOLD FROM INITIAL MVP | Narrow first-party RSS exists but is stale and still mixes industry news with opportunities | WITHHELD |
| Sub Club | WITHHOLD FROM INITIAL MVP | Technically good RSS, but editorial output is jobs, pitches, agents, and submissions | WITHHELD |
| Upstream Reviews | WITHHOLD FROM INITIAL MVP | Technically good RSS, but editorial output is reviews and entertainment podcasts | WITHHELD |

## D1 - Author Media Approved for Bootstrap

Final position: **Approved with accepted editorial-scope caveat.**

Verified endpoint:

`https://www.authormedia.com/feed/`

The feed is first-party RSS 2.0 and observed entries link back to public Author Media article pages. It preserves the original-publisher destination requirement.

The selected feed is publisher-wide rather than specific to Author Update. The inferred Author Update category feed did not provide a usable dedicated RSS endpoint during reconnaissance.

Approved Phase 3 configuration:

- Source name: `Author Media`
- Source config_key: `author_media`
- Source site URL: `https://www.authormedia.com/`
- Source approved hostname rule: exact `www.authormedia.com`
- Source subdomains allowed: no
- Endpoint config_key: `site_rss`
- Endpoint URL: `https://www.authormedia.com/feed/`
- Endpoint type: `rss_atom`
- Endpoint narrowing: exact `www.authormedia.com`
- poll_interval_seconds: `21600`
- approval state: `approved`
- lifecycle state: `active`
- operational state: `enabled`

Accepted caveat:

The whole-site feed contains Author Update reporting plus broader author education, marketing, websites, genre, and other material. Later Publication-owned Relevance rules may filter that broader content, but Phase 3 must not hard-code Author Update-specific logic into the shared engine.

Customer-facing explanation:

Author Media can be included immediately through a reliable first-party RSS feed. The available feed is broader than the specific Author Update subsection the customer linked, but it safely preserves Author Media article URLs and gives the MVP a dependable structured source.

## D2 - The Creative Penn Approved for Bootstrap

Final position: **Approved with accepted editorial-scope caveat.**

Verified endpoint:

`https://www.thecreativepenn.com/feed/podcast/`

The feed is first-party RSS 2.0 and observed entries link to public `www.thecreativepenn.com` show-notes/article pages. Audio enclosures are supplementary rather than the selected public destination.

Approved Phase 3 configuration:

- Source name: `The Creative Penn`
- Source config_key: `the_creative_penn`
- Source site URL: `https://www.thecreativepenn.com/`
- Source approved hostname rule: exact `www.thecreativepenn.com`
- Source subdomains allowed: no
- Endpoint config_key: `podcast_rss`
- Endpoint URL: `https://www.thecreativepenn.com/feed/podcast/`
- Endpoint type: `rss_atom`
- Endpoint narrowing: exact `www.thecreativepenn.com`
- poll_interval_seconds: `21600`
- approval state: `approved`
- lifecycle state: `active`
- operational state: `enabled`

Accepted caveat:

The feed is primarily author-business/interview programming rather than a pure publishing-industry news desk.

Customer-facing explanation:

The Creative Penn has a clean publisher-owned RSS feed with stable metadata and links back to public publisher pages. It is technically one of the strongest initial Sources, while some episodes will be broader author-business or interview material.

## D3 - Jane Friedman Withheld from Initial Bootstrap

Final position: **Withhold from the initial MVP.**

The reason is not a blanket prohibition on paywalled destinations. News Scraper links readers to original publishers and could potentially represent a public feed entry whose destination requires a subscription.

The present problem is channel mismatch:

- the customer described `Jane Friedman's Substack`;
- the observed Substack is a separate personal/advice channel;
- the authoritative publishing-industry reporting product is *The Bottom Line*;
- no clean public structured endpoint was verified that maps directly to that intended reporting stream;
- the main-site feed is mixed and is not a clean substitute.

Planning consequence:

- no Jane Friedman Phase 3 bootstrap Source;
- do not merge `janefriedman.com` and `janefriedman.substack.com` into one trust boundary;
- do not introduce authentication, subscription access, paywall bypass, email ingestion, or browser automation for this MVP.

Customer-facing explanation:

Jane Friedman remains highly relevant, but the public machine-readable channels do not cleanly match the industry-reporting product the customer appears to mean. It is safer to revisit this Source later than to automate the wrong channel now.

## D4 - Authors Publish Withheld After Targeted Follow-up

Final position: **Withhold from the initial MVP.**

The targeted follow-up resolved the previously open question.

Verified narrow endpoint:

`https://authorspublish.com/category/publishing-news/feed/`

Observed technical result:

- first-party RSS 2.0;
- HTTP 200;
- no redirect observed;
- publisher-owned item URLs;
- stable WordPress metadata;
- approximately 14 retained items.

Observed editorial/freshness result:

- newest retained item: 2025-10-23;
- recent retained posts are monthly `Notes from the Editor's Desk` roundups;
- sampled posts still combine legitimate industry developments with grants, submission calls, and other opportunities;
- the whole-site feed remains current but is overwhelmingly opportunities-oriented.

Therefore the withholding is **editorial/freshness-based, not a technical RSS failure**.

Planning consequence:

- do not bootstrap Authors Publish into the initial Publication;
- no further Authors Publish reconnaissance is required for Phase 3;
- do not introduce Phase 18 HTML collection to rescue this Source;
- reconsider if the Publishing Industry News feed resumes as a materially cleaner and current stream, or for a separately scoped opportunities Publication.

Customer-facing explanation:

Authors Publish does have a dedicated first-party Publishing Industry News RSS feed, so the technical integration would be easy. However, that feed has not updated since October 2025 and its posts still mix news with publishing opportunities. The broad feed is current but much noisier. For the first MVP, neither feed is a good fit.

## D5 - Sub Club Withheld from Initial Bootstrap

Final position: **Withhold from the initial MVP.**

Its first-party Substack RSS is technically straightforward, but the observed product centers on jobs, pitches, agents, submission calls, and opportunities rather than publishing-industry reporting.

Planning consequence:

- no Sub Club Phase 3 bootstrap Source;
- do not broaden engine behavior to compensate for a different editorial product;
- preserve it as a possible future Source for an opportunities-oriented Publication.

Customer-facing explanation:

Sub Club is easy to collect technically, but it is primarily an opportunities feed. Including it in the current news product would add substantial content outside the intended scope.

## D6 - Upstream Reviews Withheld from Initial Bootstrap

Final position: **Withhold from the initial MVP.**

Its first-party Substack RSS is technically straightforward, but the observed publication centers on genre book reviews, video reviews, and entertainment podcasts.

Planning consequence:

- no Upstream Reviews Phase 3 bootstrap Source;
- preserve it only as a potential Source for a separately scoped reviews/discovery Publication.

Customer-facing explanation:

Upstream Reviews has a usable feed, but its actual output is reviews and entertainment content rather than publishing-industry reporting. Including it would dilute the purpose of the initial news product.

## Resolved Alignment Decisions

### Source identity follows the publisher boundary

The persisted Author Media Source is **Author Media**, not `Author Media - Author Update`.

`Author Update` is the customer-requested subsection, but the selected structured endpoint is the publisher-wide Author Media feed. The configuration must not claim a narrower Source boundary than the endpoint actually provides.

The Author Media Source site URL is therefore:

`https://www.authormedia.com/`

### The Creative Penn podcast is an endpoint, not a separate Source

The persisted Source is **The Creative Penn**.

The selected podcast RSS is its Source endpoint. The Source site URL is:

`https://www.thecreativepenn.com/`

### Jane Friedman withholding is not a general paywall rule

A paywalled original destination is not automatically invalid. The current withholding is based on the lack of a clean public structured channel corresponding to the customer's intended industry-reporting stream.

### Transport quality and editorial fit remain separate

Authors Publish, Sub Club, and Upstream Reviews demonstrate that a Source can have technically excellent RSS while still being inappropriate for this Publication.

These editorial decisions remain Publication-owned configuration decisions and must not become shared aggregation-engine logic.

## Approved Initial Phase 3 Bootstrap Set

### Author Media

- Source name: `Author Media`
- Source config_key: `author_media`
- Source site URL: `https://www.authormedia.com/`
- Source approved hostname rule: exact `www.authormedia.com`
- Endpoint config_key: `site_rss`
- Endpoint URL: `https://www.authormedia.com/feed/`
- Endpoint type: `rss_atom`
- Endpoint narrowing: exact `www.authormedia.com`
- poll_interval_seconds: `21600`
- approval: `approved`
- lifecycle: `active`
- operational: `enabled`

### The Creative Penn

- Source name: `The Creative Penn`
- Source config_key: `the_creative_penn`
- Source site URL: `https://www.thecreativepenn.com/`
- Source approved hostname rule: exact `www.thecreativepenn.com`
- Endpoint config_key: `podcast_rss`
- Endpoint URL: `https://www.thecreativepenn.com/feed/podcast/`
- Endpoint type: `rss_atom`
- Endpoint narrowing: exact `www.thecreativepenn.com`
- poll_interval_seconds: `21600`
- approval: `approved`
- lifecycle: `active`
- operational: `enabled`

This is the complete initial Phase 3 bootstrap Source set. No other customer-supplied Source is approved for initial bootstrap.

## Customer Report Summary

The six customer-supplied candidates now fall into three final groups.

### Approved for the first MVP

**Author Media** and **The Creative Penn** both expose reliable first-party RSS feeds that can be integrated without scraping or browser automation. Their feeds are somewhat broader than a pure industry-news wire, but those scope caveats have been explicitly accepted for the MVP.

### Relevant but withheld for now

**Jane Friedman** is highly relevant editorially, but the public structured channels inspected do not cleanly represent the specific publishing-industry reporting product the customer appears to mean.

**Authors Publish** has a technically valid dedicated Publishing Industry News feed, but it is stale and still mixes news with grants and submission opportunities. Its broad feed is current but much more opportunity-heavy.

### Technically collectable but wrong product fit

**Sub Club** and **Upstream Reviews** both have technically usable feeds, but their editorial focus does not match the current publishing-industry-news Publication. They are better candidates for separately configured future products.

## Phase 3 Planning Impact

- The Phase 3 P1-P6 task boundary does not need to change.
- The initial bootstrap Source set is now explicitly approved.
- Two real structured endpoints are verified and approved, satisfying the Source-count prerequisite for Phase 3 planning.
- Authors Publish requires no further Phase 3 reconnaissance.
- No Source-specific adapter is required.
- No HTML collector should be introduced in Phase 3.
- No paywall bypass, authenticated collection, or browser automation should be introduced.
- The initial Source data remains Publication-owned bootstrap configuration rather than shared-engine logic.
- `/prompt-plan` is **UNBLOCKED**.

## Remaining Product Questions

No Source-approval decision remains for Phase 3.

A future product question remains whether to create separate Publications for opportunities-oriented or reviews/discovery content. That decision does not block the current roadmap.

## Decision Status

**FINAL FOR PHASE 3 PLANNING.**

The repository owner has explicitly approved Author Media and The Creative Penn as the initial bootstrap Source set and withheld the other four customer-supplied candidates from the initial bootstrap.