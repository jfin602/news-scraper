# ADR: Whitelist Collection and Structured-Feed Priority

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The customer wants a controlled list of trusted outlets. Open crawling reduces editorial control, increases legal/operational uncertainty, and expands attack surface. Many publishers expose RSS, Atom, or other structured endpoints that are more stable and efficient than HTML scraping.

## Decision

The Platform may store configured Source and Source-endpoint records before they are approved, but it contacts only configuration that is currently trusted and collectable.

Collection eligibility requires:

- Source and endpoint approval state = `approved`;
- Source and endpoint lifecycle state = `active`;
- Source and endpoint operational state = `enabled`;
- Publication active for collection.

Before admin UI exists, operator-maintained seed/bootstrap tooling may explicitly create approved Source/endpoint records. This is deliberate operator approval, not an eligibility bypass. Bootstrap tooling must not discover and auto-approve Sources, infer approval from fetch success, silently widen approved-domain policy, or blindly overwrite later operator-managed state during ordinary startup.

Approval/trust, lifecycle, operational state, and derived health are distinct concepts. `paused`, `disabled`, and `archived` are not health states.

Source approved domains define the maximum permitted destination boundary. Endpoint configuration may narrow that boundary but cannot silently widen it.

Integration priority is:

1. RSS/Atom;
2. stable structured API/feed;
3. configurable HTML listing extraction;
4. custom adapter;
5. browser automation as a last resort.

Before every network request/redirect, destination approval and network safety are validated. After parsing/normalization, Article links are separately validated against Source/endpoint Article-domain policy.

## Consequences

### Positive
- Editorial provenance is predictable.
- Configuration can be drafted before approval without making it collectable.
- The tech demo can bootstrap a reviewed Source list without weakening whitelist semantics.
- Trust, retirement, temporary operational pauses, and health are not conflated.
- Network behavior/load are controlled.
- Structured parsing is simpler to test/maintain.
- SSRF and uncontrolled-crawling risks are reduced.

### Costs
- Operators maintain Source/endpoint configuration and state.
- Bootstrap tooling must remain idempotent and must yield to later operator-managed state.
- Some useful outlets require custom work.
- The system does not discover/approve new Sources automatically.

## Rejected alternatives

### Crawl the open web for matching keywords
Rejected because it conflicts with the whitelist model and creates uncontrolled quality/security problems.

### Use browser automation for every Source
Rejected because it is expensive, brittle, and unnecessary for structured feeds.

### Treat seed configuration as exempt from approval rules
Rejected because it would create a hidden second trust path and violate the whitelist model.

## Compliance check

A change violates this ADR when it contacts unapproved, archived, paused, or disabled configuration; discovers/approves Sources without deliberate operator configuration; widens endpoint policy beyond Source approval silently; follows a redirect without pre-request revalidation; accepts unsafe/unapproved Article links; or makes HTML/browser collection the default despite an adequate structured feed.
