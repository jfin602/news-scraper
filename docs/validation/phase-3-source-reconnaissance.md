# Phase 3 Source Reconnaissance

## Evidence Metadata

- Reconnaissance date: 2026-08-07
- Reconnaissance time: 19:33:29 CDT (UTC-05:00); individual page/feed observations occurred during the same session.
- Repository HEAD SHA inspected: `8aabc08a710d7bed237dcc02b38592db23300e66`
- Repository status before the write: clean; no pre-existing working-tree changes were reported by `git status --short`.
- Tooling/procedure: Codex in-app Browser was used to open every supplied public Source page and inspect rendered content and `link[rel=alternate]` metadata. PowerShell `Invoke-WebRequest` directly opened candidate XML endpoints and recorded the HTTP result, final URL, content type, and bounded item metadata. No authentication, subscription, CAPTCHA action, paywall bypass, form submission, or browser automation for collection was attempted.
- Evidence level: live public-source reconnaissance, limited to the named endpoints and observed time. It is not ordinary deterministic regression evidence and does not approve a Source.
- Browser limitation: the in-app browser displayed the public landing pages and feed metadata, but direct navigation to several XML URLs reported `net::ERR_BLOCKED_BY_CLIENT`. Those feeds were therefore directly inspected with `Invoke-WebRequest`; a feed is marked VERIFIED below only where that direct response was successfully inspected.
- This artifact records observations and recommendations only. It does not approve Sources, create configuration/bootstrap data, redefine contracts, or implement Phase 3, Phase 4, Phase 5, or Phase 10 behavior. Any actual bootstrap approval requires explicit repository-owner acceptance.

## Executive Summary

| Source | Best Method | Verified Endpoint | Scope Quality | Reliability | MVP Recommendation |
| --- | --- | --- | --- | --- | --- |
| Author Media - Author Update | RSS (whole-site feed; no dedicated category feed verified) | `https://www.authormedia.com/feed/` | Usable with moderate noise | WordPress RSS, 100 retained items observed; broad feed | APPROVE_WITH_CAVEAT |
| The Creative Penn | Podcast RSS | `https://www.thecreativepenn.com/feed/podcast/` | Usable with moderate noise | First-party WordPress podcast RSS; public show-notes links | APPROVE_WITH_CAVEAT |
| Jane Friedman | Withhold | None recommended | Poor for the requested open industry-news feed | Public feeds exist, but the intended industry reporting is paid and the Substack is a different personal channel | WITHHOLD_FROM_MVP |
| Authors Publish | Withhold | None recommended | Fundamentally mismatched | First-party WordPress RSS is technically sound but dominated by submission opportunities | WITHHOLD_FROM_MVP |
| Sub Club | Withhold | None recommended | Poor alignment | First-party Substack RSS is technically sound but devoted to jobs, pitches, and submissions | WITHHOLD_FROM_MVP |
| Upstream Reviews | Withhold | None recommended | Fundamentally mismatched | First-party Substack RSS is technically sound but reviews/podcasts, not industry news | WITHHOLD_FROM_MVP |

## Source: Author Media - Author Update

### Customer Intent

The customer appears to want Author Media's recurring Author Update publishing-news analysis for indie authors, not Author Media's whole educational/marketing catalog.

### Authoritative Site

- Site: `https://www.authormedia.com/author-update/`
- Hostname: `www.authormedia.com`
- Channel type: Author Media publisher subsection and podcast/show; the landing page describes publishing news, advice, and analysis and displays Author Update article entries.

### Candidate Collection Methods Tested

1. Author Update landing page and category archive
   - URL: `https://www.authormedia.com/author-update/` and the linked `https://www.authormedia.com/category/author-update/`
   - Evidence: Browser observation showed recent Author Update articles such as “Fauci’s Diary, Joe Rogan, and the Magic Boom in Fiction” (Aug. 3) and “The Digital vs. Physical War: AI Companies Are Pulping Books by the Pallet” (Jul. 28). The category page showed publishing/AI/author-business summaries.
   - Result: Good public HTML listing, but no category-specific alternate RSS link was exposed.
2. Inferred WordPress category RSS, tested directly
   - URL: `https://www.authormedia.com/category/author-update/feed/`
   - Evidence: Browser navigation finished at `https://www.authormedia.com/category/author-update/`, returning the HTML archive rather than XML.
   - Result: Not a usable dedicated feed; do not configure it as `rss_atom`.
3. Whole-site RSS exposed in landing-page metadata
   - URL: `https://www.authormedia.com/feed/`
   - Evidence: The landing page exposed it as `application/rss+xml` with title “Author Media » Feed.” Direct inspection returned RSS 2.0 with 100 items and site-owned article links. Recent sampled entries were “SEO for Author Websites: The Only Guide You Need in 2026” (2026-08-05; `https://www.authormedia.com/seo-for-author-websites-the-only-guide-you-need-in-2026/`) and “Zeitgeist: How Science Skepticism Is Reshaping Popular Fiction” (2026-08-03; `https://www.authormedia.com/zeitgeist-how-science-skepticism-is-reshaping-popular-fiction/`); the next sampled entry was the Author Update item “Fauci’s Diary, Joe Rogan, and the Magic Boom in Fiction.” Items expose WordPress GUIDs, titles, dates, categories, and excerpts.
   - Result: Viable first-party RSS, but broader than the customer’s intended Author Update channel.
4. Officially linked Author Update podcast RSS
   - URL: `https://feeds.buzzsprout.com/2470343.rss`
   - Evidence: The Author Update landing page explicitly labels this link “RSS.” Direct inspection returned RSS 2.0 after redirecting to `https://rss.buzzsprout.com/2470343.rss`; recent entries included “Fauci’s Diary and the Magic Boom in Fiction” (2026-07-31) and “The Digital Vs. Physical War - AI Companies Pulping Books By The Pallet” (2026-07-24). It has stable Buzzsprout GUIDs, titles, timestamps, authors, summaries, and audio enclosures, but sampled items did not expose the corresponding Author Media article/show-notes URL as the RSS item link.
   - Result: Not selected: the third-party-hosted podcast feed would require a broader Source boundary and does not preserve the preferred Author Media article destination in the inspected items.

### Recommended Method

RSS

### Endpoint Verification

- Status: VERIFIED
- Tested URL: `https://www.authormedia.com/feed/`
- Final URL: `https://www.authormedia.com/feed/`
- HTTP outcome: 200
- Content type: `application/rss+xml; charset=UTF-8`
- Feed type: RSS 2.0 (WordPress)
- Observation time: 2026-08-07 CDT
- Recent item evidence:
  - “SEO for Author Websites: The Only Guide You Need in 2026” — 2026-08-05 — `https://www.authormedia.com/seo-for-author-websites-the-only-guide-you-need-in-2026/`
  - “Zeitgeist: How Science Skepticism Is Reshaping Popular Fiction” — 2026-08-03 — `https://www.authormedia.com/zeitgeist-how-science-skepticism-is-reshaping-popular-fiction/`
- Item destination behavior: sampled item links point to public `www.authormedia.com` article pages. They preserve publisher destinations; only the scope, not destination provenance, is the caveat.

### Proposed Source Domain Policy

- Source hostname: `www.authormedia.com`
- Approved hostname rule(s): exact `www.authormedia.com`
- Subdomains required: No
- Reason: the selected endpoint and sampled article destinations remain on the same host. Do not add `feeds.buzzsprout.com`, `rss.buzzsprout.com`, or storage hosts for the unselected podcast endpoint.

### Proposed Phase 3 Endpoint Configuration

- source_config_key: `author_media`
- endpoint_config_key: `site_rss`
- endpoint_type: `rss_atom`
- endpoint_url: `https://www.authormedia.com/feed/`
- endpoint_narrowing: exact `www.authormedia.com`; URL is under the Source maximum boundary
- poll_interval_seconds: `21600`

### Content Fit

Usable with moderate noise. The selected feed includes the desired Author Update reporting, but it also includes evergreen author websites, promotion, genre analysis, and other Author Media education. It should not be represented as a dedicated Author Update feed.

### Collection and Reliability Risks

The selected RSS feed is first-party and uses stable WordPress fields, but it is a broad 100-item feed. A future publication-owned Relevance policy may manage its extra material, but no such behavior is assumed or implemented here. The dedicated HTML category listing is cleaner but belongs to a later configurable HTML adapter phase. The podcast RSS is official but has a distinct third-party endpoint host and inspected entries favor audio enclosures over Author Media item URLs.

### MVP Recommendation

APPROVE_WITH_CAVEAT

### Reason

The whole-site first-party RSS is reliable and preserves source-owned article URLs, and the observed stream includes Author Update content. Approval is conditional on accepting the known breadth/noise because no dedicated Author Update RSS endpoint was verified.

## Source: The Creative Penn

### Customer Intent

The customer appears to want a dependable stream of self-publishing and author-business developments from Joanna Penn/The Creative Penn, preferably with useful public episode/show-notes pages rather than audio-only items.

### Authoritative Site

- Site: `https://www.thecreativepenn.com/the-creative-penn-podcast-for-authors/`
- Hostname: `www.thecreativepenn.com`
- Channel type: publisher-hosted author-business podcast. The page says episodes post every Wednesday and offers its own RSS link.

### Candidate Collection Methods Tested

1. Official podcast RSS linked from the podcast page
   - URL: `https://www.thecreativepenn.com/feed/podcast/`
   - Evidence: The browser page labels the link “RSS.” Direct inspection returned RSS 2.0; the first recent item, “From Blog To Community To Book: A Non-Fiction Author’s Journey With Suzanne Smith” (2026-08-05), uses a public `www.thecreativepenn.com` show-notes URL and a non-permalink WordPress GUID. The podcast page’s current listing also showed the next episode, “How to Prove Demand For Your Stories And Get The Attention of Hollywood With Brooks Elms.” The feed includes publication dates, author metadata, categories, descriptions, images, and audio enclosure metadata.
   - Result: Best viable structured option; publisher-owned show-notes links preserve the intended destination.
2. General site RSS
   - URL: no general RSS alternate was exposed by the inspected podcast landing page.
   - Evidence: The inspected page exposed only oEmbed alternates, while the official podcast RSS was visibly linked.
   - Result: Not selected; no separately verified general/category endpoint was discovered from the supplied authoritative page.

### Recommended Method

Podcast RSS

### Endpoint Verification

- Status: VERIFIED
- Tested URL: `https://www.thecreativepenn.com/feed/podcast/`
- Final URL: `https://www.thecreativepenn.com/feed/podcast/`
- HTTP outcome: 200
- Content type: `application/rss+xml; charset=UTF-8`
- Feed type: RSS 2.0 (WordPress podcast feed)
- Observation time: 2026-08-07 CDT
- Recent item evidence:
  - “From Blog To Community To Book: A Non-Fiction Author’s Journey With Suzanne Smith” — 2026-08-05 — `https://www.thecreativepenn.com/2026/08/05/from-blog-to-community-to-book-a-non-fiction-authors-journey-with-suzanne-smith/`
  - “How to Prove Demand For Your Stories And Get The Attention of Hollywood With Brooks Elms” — current next episode shown on the authoritative public podcast page during the same observation; publisher page is under `www.thecreativepenn.com`.
- Item destination behavior: inspected feed item links use public `www.thecreativepenn.com` show-notes/article pages; audio enclosures are supplementary rather than the selected public destination.

### Proposed Source Domain Policy

- Source hostname: `www.thecreativepenn.com`
- Approved hostname rule(s): exact `www.thecreativepenn.com`
- Subdomains required: No
- Reason: selected feed and inspected show-notes item link are on the same publisher host. Third-party sponsors and external links found in descriptions are not endpoint or accepted Article destinations.

### Proposed Phase 3 Endpoint Configuration

- source_config_key: `the_creative_penn`
- endpoint_config_key: `podcast_rss`
- endpoint_type: `rss_atom`
- endpoint_url: `https://www.thecreativepenn.com/feed/podcast/`
- endpoint_narrowing: exact `www.thecreativepenn.com`; URL is under the Source maximum boundary
- poll_interval_seconds: `21600`

### Content Fit

Usable with moderate noise. It is mostly author-business, craft, and interview programming; some items cover self-publishing, AI, direct sales, and publishing-business developments, but it is not a dedicated publishing-news desk.

### Collection and Reliability Risks

The endpoint is first-party WordPress RSS and has strong item identity/destination metadata. The main risk is editorial breadth, not transport reliability. Podcast feed descriptions can contain third-party sponsor/guest URLs; future normalization and Article-link policy must retain only the item’s publisher URL as the public destination. No authentication or JavaScript rendering was required for the observed data.

### MVP Recommendation

APPROVE_WITH_CAVEAT

### Reason

The official, site-hosted podcast RSS gives stable identifiers, timestamps, and publisher-hosted show-notes links. It is a viable second deliberate MVP feed if the owner accepts a broader author-business/interview stream rather than pure industry news.

## Source: Jane Friedman

### Customer Intent

The customer label “Jane Friedman’s Substack” likely conflates Jane Friedman’s public Substack with her better-known publishing-industry reporting. The official site identifies *The Bottom Line* as the award-winning business-of-publishing newsletter; that is the authoritative industry-reporting channel, not the Substack.

### Authoritative Site

- Site: `https://janefriedman.com/`
- Hostname: `janefriedman.com`
- Channel type: publisher/author site with a paid publishing-industry newsletter and public articles. A distinct hosted publication exists at `https://janefriedman.substack.com/`.

### Candidate Collection Methods Tested

1. Official-site RSS
   - URL: `https://janefriedman.com/feed/`
   - Evidence: The home page exposed it as “Jane Friedman » Feed.” Direct inspection returned RSS 2.0. A recent item, “Links of Interest: August 5, 2026,” links to `https://janefriedman.com/links-of-interest-august-5-2026/` and is categorized “Premium Content”; the feed content itself states that the full article is available to paid newsletter subscribers. The home page also displayed mixed public article topics such as audiobook voice, plotting, and publicity.
   - Result: Technically valid but not selected: it mixes general writing advice with premium industry items whose substantive content is unavailable without subscription.
2. Official Substack RSS
   - URL: `https://janefriedman.substack.com/feed`
   - Evidence: Browser metadata on the public Substack exposed this RSS URL. Direct inspection returned RSS 2.0 titled “Sinister Malefactor of Panglossian Expectations,” described as Jane’s personal career/advice writing. A recent observed item was “Stop Obsessing About Your Genre-Subgenre-Subsubgenre” (2026-03-04) linking to its Substack post URL.
   - Result: Valid feed, but it is not the stated publishing-industry reporting product.
3. The Bottom Line official page
   - URL: `https://janefriedman.com/the-bottom-line-janes-publishing-industry-newsletter/`
   - Evidence: Browser observation describes exclusive weekly, fact-checked publishing-business analysis and says paid subscribers have access to nearly 3,000 archived items; it presents subscription/login controls.
   - Result: Best editorial match, but not a public structured collection route. No authentication or paid content was accessed.

### Recommended Method

Withhold

### Endpoint Verification

- Status: NONE
- No endpoint is recommended. The open official-site RSS and the Substack RSS were both directly inspected, but neither is an appropriate public replacement for the paid, authoritative *The Bottom Line* reporting channel.

### Proposed Source Domain Policy

- Source hostname: `janefriedman.com`
- Approved hostname rule(s): NONE
- Subdomains required: NONE
- Reason: no Source is proposed for bootstrap. The Substack would be a separate host and, if ever approved for a different Publication purpose, should be a separate Source rather than silently added to a JaneFriedman.com boundary.

### Proposed Phase 3 Endpoint Configuration

- source_config_key: NONE
- endpoint_config_key: NONE
- endpoint_type: NONE
- endpoint_url: NONE
- endpoint_narrowing: NONE
- poll_interval_seconds: NONE

### Content Fit

The paid Bottom Line is excellent alignment. The actual public Substack is personal/advice-oriented and therefore a mismatch for the customer’s label. The public website feed is mixed and includes premium industry links that cannot be responsibly treated as open full articles.

### Collection and Reliability Risks

No access control was bypassed. Treating premium feed excerpts as a substitute for the paid newsletter would create a poor and potentially misleading product experience. Combining the unrelated Substack host with the official website would also blur distinct channel/provenance boundaries.

### MVP Recommendation

WITHHOLD_FROM_MVP

### Reason

The authoritative reporting product is paid/private, while the technically collectable public channels do not provide the requested industry-news stream. Reconsider only if Jane Friedman explicitly offers a public, appropriately scoped feed or authorizes a public syndication route.

## Source: Authors Publish

### Customer Intent

The customer likely expects publishing opportunities or industry information useful to authors, but the initial Publication is a publishing-industry news feed rather than a submissions/opportunities bulletin.

### Authoritative Site

- Site: `https://authorspublish.com/`
- Hostname: `authorspublish.com`
- Channel type: Authors Publish Magazine; publisher-operated magazine/newsletter focused on submission opportunities and author career guidance.

### Candidate Collection Methods Tested

1. Main site and category/navigation surface
   - URL: `https://authorspublish.com/`
   - Evidence: Browser observation described “legitimate publishing opportunities” and showed current cards including “Nine Publishers Open to Direct Submissions in August 2026,” literary-magazine calls, contests, and publishers seeking submissions. No RSS/Atom alternate or narrower publishing-news feed was exposed on this public landing page.
   - Result: Strong evidence of editorial mismatch for the initial Publication.
2. Whole-site RSS, directly tested
   - URL: `https://authorspublish.com/feed/`
   - Evidence: Direct inspection returned RSS 2.0. Recent sampled entry “Nine Publishers Open to Direct Submissions in August 2026” (2026-08-06) links to `https://authorspublish.com/nine-publishers-open-to-direct-submissions-in-august-2026/`, has a WordPress GUID, date, author, categories, and excerpt. The next public landing-page items were a literary magazine seeking submissions and themed submission calls/contests.
   - Result: Valid first-party feed, but dominated by submissions/opportunities rather than publishing-industry reporting. No cleaner first-party category feed was discovered from the authoritative landing page.

### Recommended Method

Withhold

### Endpoint Verification

- Status: NONE
- No endpoint is recommended. `https://authorspublish.com/feed/` was verified as RSS 2.0 (200, `application/rss+xml; charset=UTF-8`) but withheld for editorial fit, not technical failure.

### Proposed Source Domain Policy

- Source hostname: `authorspublish.com`
- Approved hostname rule(s): NONE
- Subdomains required: NONE
- Reason: no Source is proposed for bootstrap.

### Proposed Phase 3 Endpoint Configuration

- source_config_key: NONE
- endpoint_config_key: NONE
- endpoint_type: NONE
- endpoint_url: NONE
- endpoint_narrowing: NONE
- poll_interval_seconds: NONE

### Content Fit

Fundamentally mismatched for a rolling publishing-industry news product. The observed content is useful to writers but is primarily submissions, contests, journals, and publisher listings.

### Collection and Reliability Risks

Technically, the feed is conventional first-party WordPress RSS with source-owned links. Operationally, it would fill the public feed with time-sensitive opportunity content instead of the intended news, creating avoidable scope/noise without a demonstrated clean endpoint.

### MVP Recommendation

WITHHOLD_FROM_MVP

### Reason

This is a content-fit withholding, not a scraping problem. Reconsider for a separate opportunities-focused Publication or if Authors Publish exposes and verifies a substantially cleaner publishing-industry news feed.

## Source: Sub Club

### Customer Intent

The customer likely expects useful professional-writing opportunities. This must be evaluated separately from whether that material is publishing-industry news for indie authors.

### Authoritative Site

- Site: `https://subclub.substack.com/`
- Hostname: `subclub.substack.com`
- Channel type: hosted Substack publication. Its public description is “Submission opportunities for creative and professional writers.”

### Candidate Collection Methods Tested

1. Substack RSS exposed in page metadata
   - URL: `https://subclub.substack.com/feed`
   - Evidence: Browser metadata exposed the RSS alternate. Direct inspection returned RSS 2.0, owned by “Chill Subs,” with Substack post links, stable URL GUIDs, titles, dates, authors, and image metadata. Recent sampled item “We’re Hiring! And Paying Money! Also, 19 Jobs Paying up to $150k/yr & $50/hr + 30 Pitch Calls Paying up to $750” (2026-08-07) links to `https://subclub.substack.com/p/19-jobs-paying-up-to-150kyr-and-50hr`; its description mentions jobs and pitch calls. The page’s own description and testimonial also identify agents and publications open to submissions.
   - Result: Technically excellent first-party hosted RSS, but the editorial product is jobs/pitches/submissions rather than industry news.

### Recommended Method

Withhold

### Endpoint Verification

- Status: NONE
- No endpoint is recommended. The above RSS was directly verified (200, `application/xml; charset=utf-8`, RSS 2.0), but it is withheld for editorial fit.

### Proposed Source Domain Policy

- Source hostname: `subclub.substack.com`
- Approved hostname rule(s): NONE
- Subdomains required: NONE
- Reason: no Source is proposed for bootstrap. If a future opportunities Publication deliberately approves it, the host boundary should remain exact `subclub.substack.com`, not all of `substack.com`.

### Proposed Phase 3 Endpoint Configuration

- source_config_key: NONE
- endpoint_config_key: NONE
- endpoint_type: NONE
- endpoint_url: NONE
- endpoint_narrowing: NONE
- poll_interval_seconds: NONE

### Content Fit

Poor alignment. It is high-frequency, relevant-to-writers opportunity information, but it is not a source of publishing-industry reporting. The first recent item is explicitly jobs and pitch calls.

### Collection and Reliability Risks

The public RSS has good identity/destination fields and does not require browser automation or login. Its operational risk is editorial: many listings would create noisy, expiring opportunities rather than the intended news product; any paid/free-post distinctions would need separate policy if the product scope later changes.

### MVP Recommendation

WITHHOLD_FROM_MVP

### Reason

Do not include solely because collection is easy. Reconsider only for a deliberately configured opportunities-oriented Publication with its own categories and relevance policy.

## Source: Upstream Reviews

### Customer Intent

The customer may have expected book-market or author information, but the public publication must be judged by its actual editorial output.

### Authoritative Site

- Site: `https://upstreamreviews.substack.com/`
- Hostname: `upstreamreviews.substack.com`
- Channel type: hosted Substack publication by Declan Finn; the public description is “REVIEWING ONLY THE BEST IN SCI-FI, FANTASY, HORROR, MYSTERY & THRILLERS.”

### Candidate Collection Methods Tested

1. Substack RSS exposed in page metadata
   - URL: `https://upstreamreviews.substack.com/feed`
   - Evidence: Browser metadata exposed the RSS alternate. Direct inspection returned RSS 2.0 with URL GUIDs, post links, dates, authors, descriptions, and image/video enclosure metadata. Two recent items were “Podcast: Taking to the stars with the pilots of Babylon 5!” (2026-08-06; `https://upstreamreviews.substack.com/p/podcast-taking-to-the-stars-with-bd8`) and “Video review: Escaping Infinity by Richard Paolinelli” (2026-08-05; `https://upstreamreviews.substack.com/p/video-review-escaping-infinity-by`).
   - Result: Technically valid first-party hosted RSS, but actual output is reviews and entertainment podcasts.

### Recommended Method

Withhold

### Endpoint Verification

- Status: NONE
- No endpoint is recommended. The RSS was directly verified (200, `application/xml; charset=utf-8`, RSS 2.0), but it is not suitable for the initial publishing-industry Publication.

### Proposed Source Domain Policy

- Source hostname: `upstreamreviews.substack.com`
- Approved hostname rule(s): NONE
- Subdomains required: NONE
- Reason: no Source is proposed for bootstrap. A future separate review Publication would require an exact hosted-publication boundary, not a broad `substack.com` rule.

### Proposed Phase 3 Endpoint Configuration

- source_config_key: NONE
- endpoint_config_key: NONE
- endpoint_type: NONE
- endpoint_url: NONE
- endpoint_narrowing: NONE
- poll_interval_seconds: NONE

### Content Fit

Fundamentally mismatched. The observed channel self-identifies as genre reviews; its latest items are an entertainment-panel podcast and a book video review, not publishing-industry news or author-business reporting.

### Collection and Reliability Risks

No technical collection obstacle was observed. The reason to exclude is the source’s editorial identity; adding it would dilute the feed with reviews and podcasts unrelated to the Publication configuration.

### MVP Recommendation

WITHHOLD_FROM_MVP

### Reason

The task specifically allows withholding a technically easy feed when it is fundamentally book-review content. Reconsider only for a separately scoped reviews/discovery Publication.

## Recommended Initial MVP Source Set

- Source name: Author Media - Author Update (configured as the broader Author Media source with the caveat documented above)
  - Source config_key: `author_media`
  - Source site URL: `https://www.authormedia.com/author-update/`
  - Source approved hostname rule(s): exact `www.authormedia.com`
  - Endpoint config_key: `site_rss`
  - Endpoint URL: `https://www.authormedia.com/feed/`
  - Endpoint type: `rss_atom`
  - Endpoint narrowing: exact `www.authormedia.com`
  - poll_interval_seconds: `21600`
  - recommendation classification: APPROVE_WITH_CAVEAT
  - recommended initial states if explicitly accepted in bootstrap: approval `approved`; lifecycle `active`; operational `enabled`.
- Source name: The Creative Penn
  - Source config_key: `the_creative_penn`
  - Source site URL: `https://www.thecreativepenn.com/the-creative-penn-podcast-for-authors/`
  - Source approved hostname rule(s): exact `www.thecreativepenn.com`
  - Endpoint config_key: `podcast_rss`
  - Endpoint URL: `https://www.thecreativepenn.com/feed/podcast/`
  - Endpoint type: `rss_atom`
  - Endpoint narrowing: exact `www.thecreativepenn.com`
  - poll_interval_seconds: `21600`
  - recommendation classification: APPROVE_WITH_CAVEAT
  - recommended initial states if explicitly accepted in bootstrap: approval `approved`; lifecycle `active`; operational `enabled`.

These values are bootstrap-ready proposals only. Reconnaissance did not authorize any approval state, and ordinary bootstrap must remain deliberate, idempotent, create-if-absent, and non-overwriting.

## Withheld or Deferred Sources

- Jane Friedman — WITHHOLD_FROM_MVP. The actual authoritative industry-reporting channel is the paid *The Bottom Line*; public feeds are either mixed/premium-excerpt site content or a separate personal Substack. Reconsider if a public, suitably scoped industry feed is explicitly offered.
- Authors Publish — WITHHOLD_FROM_MVP. Its verified RSS is primarily submissions, contests, and literary-magazine/publisher opportunities. Reconsider for a separate opportunities Publication or on verification of a cleaner industry-news endpoint.
- Sub Club — WITHHOLD_FROM_MVP. Its verified RSS is opportunities, jobs, pitch calls, agents, and submissions. Reconsider only under an explicitly separate opportunities-product configuration.
- Upstream Reviews — WITHHOLD_FROM_MVP. Its verified RSS is reviews and entertainment podcasts. Reconsider only for a separately scoped reviews/discovery Publication.

## Open Questions and Operator Decisions

- Accept or reject the two caveated bootstrap candidates knowing that Author Media’s selected feed is broader than Author Update and The Creative Penn is mainly author-business/interview programming.
- Decide whether the product should later add a separate opportunities-oriented Publication. That is a product-scope decision, not a reason to add Authors Publish or Sub Club to this publishing-industry news feed.

## Phase 3 Planning Impact

1. Do we now have at least two technically verified and suitable `rss_atom` endpoints? **Yes.** `https://www.authormedia.com/feed/` and `https://www.thecreativepenn.com/feed/podcast/` were directly inspected successfully and are suitable only with the stated editorial-scope caveats.
2. Which Sources could safely become deliberate Phase 3 bootstrap approvals if the repository owner accepts this reconnaissance? **Author Media** (`author_media` / `site_rss`) and **The Creative Penn** (`the_creative_penn` / `podcast_rss`), with exact-host Source policies and endpoint narrowing recorded above.
3. Does any Source require behavior outside Phase 3? **Yes, but none is proposed on that basis.** HTML collection for the cleaner Author Update category would be a later HTML-adapter concern; runtime DNS/address/port/redirect enforcement remains Phase 4; HTTP/RSS parsing remains Phase 5; scheduling remains Phase 10. Paid Bottom Line access, browser automation, and collection of private material are not proposed.
4. Does any finding require changing the currently assessed Phase 3 P1-P6 task boundaries? **No.** The findings provide configuration candidates only and do not require new behavior, a source-specific adapter, or topic-specific engine code.
5. What specific information, if any, is still required before `/prompt-plan` can proceed? **Only explicit repository-owner acceptance/rejection of the two caveated candidates as initial bootstrap data.** The technical reconnaissance needed for at least two `rss_atom` endpoints is complete.

## Evidence Limitations

- The browser’s XML navigation was blocked by a client rule for several feeds, so direct HTTP inspection supplied the endpoint body/header evidence. This limits the browser claim to the public source pages and metadata, not feed-rendering behavior.
- No browser request headers were available for the feeds; the artifact records `Invoke-WebRequest` HTTP outcomes and response `Content-Type` values where observed.
- Feed retention counts were only recorded where directly observed: Author Media exposed 100 items. Counts for the other feeds were not asserted.
- Authors Publish did not expose a narrower industry-news feed from the inspected landing page. This is not a claim that none exists anywhere on the site; it is sufficient evidence that the verified whole-site feed is not suitable for this Publication.
- The Creative Penn’s second recent title was observed in the authoritative podcast page listing, but only the first corresponding RSS item’s full metadata/link was bounded and retained in this artifact. The feed remains verified from its direct XML response.
- Publisher contents, access models, endpoint behavior, and editorial focus are time-sensitive. No conclusion here authorizes live-source validation or weakens future Phase 4 safety checks.
