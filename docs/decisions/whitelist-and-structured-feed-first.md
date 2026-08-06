# ADR: Whitelist Collection and Structured-Feed Priority

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The customer wants a controlled list of trusted outlets. Open crawling reduces editorial control, increases legal/operational uncertainty, and expands attack surface. Many publishers expose RSS, Atom, or other structured endpoints that are more stable and efficient than HTML scraping.

## Decision

The Platform contacts only administrator-approved Sources and Source endpoints.

Approval/trust state is distinct from operational state:

- Source and endpoint must both be `approved`;
- Source and endpoint must both be operationally `enabled` to be scheduled/fetched;
- `paused` and `disabled` are operational states, not health states.

Source approved domains define the maximum permitted destination boundary. Endpoint configuration may narrow that boundary but cannot silently widen it.

Integration priority is:

1. RSS/Atom;
2. stable structured API/feed;
3. configurable HTML listing extraction;
4. custom adapter;
5. browser automation as a last resort.

Before every network request/redirect, destination network safety and approval are validated. After parsing/normalization, Article links are separately validated against Source/endpoint article-domain policy.

## Consequences

### Positive
- Editorial provenance is predictable.
- Trust decisions and operational pauses are not conflated.
- Network behavior/load are controlled.
- Structured parsing is simpler to test/maintain.
- SSRF and uncontrolled-crawling risks are reduced.
- Endpoint health remains distinct from admin state.

### Costs
- Administrators maintain Source/endpoint configuration.
- Some useful outlets require custom work.
- The system does not discover/approve new Sources automatically.

## Rejected alternatives

### Crawl the open web for matching keywords
Rejected because it conflicts with the whitelist model and creates uncontrolled quality/security problems.

### Use browser automation for every Source
Rejected because it is expensive, brittle, and unnecessary for structured feeds.

## Compliance check

A change violates this ADR when it contacts an unapproved or operationally ineligible destination, widens endpoint policy beyond Source approval silently, follows a redirect without pre-request revalidation, accepts unsafe/unapproved Article links, or makes HTML/browser collection the default despite an adequate structured feed.
