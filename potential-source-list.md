# Potential Source List

Working worksheet for candidate Publication sources discovered during source reconnaissance.

This file is an operational planning aid, not approval authority. An entry here means only that a source is worth considering. Before collection, each candidate must still follow the governed onboarding sequence in `docs/operations/source-onboarding.md`: configure → inspect → approve → enable → Check now → inspect health and recent runs.

Use the admin-ready values below as the starting point when linking a candidate. Keep uncertain or unverified values explicit rather than guessing.

| Name | Website URL | Source config key | Approved Source domain(s) | Include subdomains | Source admission phrases | Source priority | Source default Category | Endpoint config key | Endpoint type | Endpoint URL | Poll interval (seconds) | Endpoint default Category | Endpoint domain policy | Initial Source state | Initial Endpoint state | Recon status / notes |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| Just Reading Nook | https://justreadingnook.com/ | `just_reading_nook` | `justreadingnook.com` | No | None | 0 | None | `publishing_insight_rss` | `rss_atom` | https://justreadingnook.com/category/publishing-insight/feed/ | 900 | None | Inherit Source maximum | Unapproved + Disabled | Unapproved + Disabled | Strong candidate. Dedicated `Publishing Insight` category is substantially more relevant than the broad site feed. Category archive is confirmed; category-feed URL follows the site's WordPress feed structure and should be verified with the real collector before approval/enabling. |
| Authors Publish | https://authorspublish.com/ | `authors_publish` | `authorspublish.com` | No | None | 0 | None | `publishing_news_rss` | `rss_atom` | https://authorspublish.com/category/publishing-news/feed/ | 21600 | None | Inherit Source maximum | Unapproved + Disabled | Unapproved + Disabled | Verified first-party RSS 2.0 endpoint with publisher-owned article links. Historical recon found this dedicated Publishing Industry News feed stale and still mixed with opportunities; broad `https://authorspublish.com/feed/` is current but much more opportunity-heavy. Keep as a candidate and re-check freshness/editorial fit before approval. |
| Sub Club | https://subclub.substack.com/ | `sub_club` | `subclub.substack.com` | No | None | 0 | None | `site_rss` | `rss_atom` | https://subclub.substack.com/feed | 21600 | None | Inherit Source maximum | Unapproved + Disabled | Unapproved + Disabled | Verified first-party Substack RSS 2.0 with stable post links and metadata. Strong fit for an opportunities-oriented feed: jobs, pitches, agents, presses, and submission calls. Previously withheld only because that editorial product did not match the original publishing-industry-news scope. Keep the approved-domain boundary on exact `subclub.substack.com`, not all of `substack.com`. |
| Upstream Reviews | https://upstreamreviews.substack.com/ | `upstream_reviews` | `upstreamreviews.substack.com` | No | None | 0 | None | `site_rss` | `rss_atom` | https://upstreamreviews.substack.com/feed | 21600 | None | Inherit Source maximum | Unapproved + Disabled | Unapproved + Disabled | Verified first-party Substack RSS 2.0 with stable post links, dates, authors, descriptions, and media metadata. Editorial output is primarily genre book/video reviews and entertainment podcasts, so it is best treated as a reviews/discovery candidate rather than publishing-industry news. Keep the approved-domain boundary on exact `upstreamreviews.substack.com`. |

## Worksheet rules

- Prefer RSS/Atom over HTML listing when a suitable structured feed exists.
- Keep the Source approved-domain boundary as narrow as practical; add redirect/article hostnames only when observed and understood.
- Leave RSS/Atom admission phrases empty when a dedicated feed already provides an appropriate content boundary.
- Use `0` Source priority unless a deliberate duplicate-Primary preference has been established.
- Use the admin creation defaults of **Unapproved + Disabled** until reconnaissance and a real governed collection check support approval and enablement.
- The admin UI currently defaults new endpoints to a 900-second poll interval. Change that per source only when there is a reason to do so; previously reconnoitered low-frequency sources may use `21600` (6 hours) as a conservative starting point.
- `None` for a default Category means no Source/endpoint fallback Category is proposed by reconnaissance; normal Relevance/Category configuration remains separate.
- A candidate should not be marked ready merely because its URL responds. Approval, domain policy, parser behavior, collection health, and content quality must all be reviewed.
