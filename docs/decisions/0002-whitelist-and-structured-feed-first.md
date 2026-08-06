# ADR 0002: Whitelist Collection and Structured-Feed Priority

**Status:** Accepted  
**Date:** 2026-08-06

## Context

The customer wants a controlled list of trusted outlets. Open crawling would reduce editorial control, increase legal and operational uncertainty, and expand the attack surface. Many publishers expose RSS, Atom, or other structured endpoints that are more stable and efficient than HTML scraping.

## Decision

The platform collects only administrator-approved sources and endpoints.

Integration priority is:

1. RSS/Atom;
2. stable structured API/feed;
3. configurable HTML listing extraction;
4. custom adapter;
5. browser automation as a last resort.

The whitelist applies to initial requests, redirects, and accepted article-link domains.

## Consequences

### Positive

- Editorial provenance is predictable.
- Network behavior and load are controlled.
- Structured parsing is simpler to test and maintain.
- SSRF and uncontrolled-crawling risks are reduced.
- Source health can be understood per configured endpoint.

### Costs

- Administrators must maintain source configuration.
- Some useful outlets may require custom work.
- The system does not discover new sources automatically.

## Rejected alternatives

### Crawl the open web for matching keywords

Rejected because it conflicts with the customer's whitelist model and creates uncontrolled quality and security problems.

### Use browser automation for every source

Rejected because it is expensive, brittle, and unnecessary for structured feeds.

## Compliance check

A change violates this ADR when it contacts an unapproved destination, follows redirects without revalidation, or makes HTML/browser collection the default despite an adequate structured feed.
