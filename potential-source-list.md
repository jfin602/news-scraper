# Potential Source List

Working worksheet for candidate Publication sources discovered during source reconnaissance.

This file is an operational planning aid, not approval authority. An entry here means only that a source is worth considering. Before collection, each candidate must still follow the governed onboarding sequence in `docs/operations/source-onboarding.md`: configure → inspect → approve → enable → Check now → inspect health and recent runs.

Use the admin-ready values below as the starting point when linking a candidate. Keep uncertain or unverified values explicit rather than guessing.

| Name | Website URL | Source config key | Approved Source domain(s) | Include subdomains | Source admission phrases | Source priority | Source default Category | Endpoint config key | Endpoint type | Endpoint URL | Poll interval (seconds) | Endpoint default Category | Endpoint domain policy | Initial Source state | Initial Endpoint state | Recon status / notes |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| Just Reading Nook | https://justreadingnook.com/ | `just_reading_nook` | `justreadingnook.com` | No | None | 0 | None | `publishing_insight_rss` | `rss_atom` | https://justreadingnook.com/category/publishing-insight/feed/ | 900 | None | Inherit Source maximum | Unapproved + Disabled | Unapproved + Disabled | Strong candidate. Dedicated `Publishing Insight` category is substantially more relevant than the broad site feed. Category archive is confirmed; category-feed URL follows the site's WordPress feed structure and should be verified with the real collector before approval/enabling. |

## Worksheet rules

- Prefer RSS/Atom over HTML listing when a suitable structured feed exists.
- Keep the Source approved-domain boundary as narrow as practical; add redirect/article hostnames only when observed and understood.
- Leave RSS/Atom admission phrases empty when a dedicated feed already provides an appropriate content boundary.
- Use `0` Source priority unless a deliberate duplicate-Primary preference has been established.
- Use the admin creation defaults of **Unapproved + Disabled** until reconnaissance and a real governed collection check support approval and enablement.
- The admin UI currently defaults new endpoints to a 900-second poll interval. Change that per source only when there is a reason to do so.
- `None` for a default Category means no Source/endpoint fallback Category is proposed by reconnaissance; normal Relevance/Category configuration remains separate.
- A candidate should not be marked ready merely because its URL responds. Approval, domain policy, parser behavior, collection health, and content quality must all be reviewed.
