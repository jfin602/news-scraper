# Public Feed and Admin Contract

## 1. Public-feed purpose

The public experience is a fast, readable index of recent relevant headlines. It promotes discovery and sends readers to the original publisher.

## 2. Desktop feed

The default desktop presentation MUST support the customer's core three-column concept:

| Date | Headline | Source |
|---|---|---|
| Aug. 6, 2026 | Linked original headline | Source name |

Requirements:

- reverse-chronological ordering by effective feed date;
- headline is the dominant interactive element;
- headline links directly to the stored original/canonical public destination;
- source identity is clear;
- date formatting is consistent with publication settings;
- pinned articles are visually distinguishable without breaking ordering semantics unexpectedly;
- loading, empty, and error states are explicit.

## 3. Mobile feed

Mobile MUST not force a compressed desktop table. Each row may become a compact stacked item:

```text
AUG 6 · SOURCE NAME
Linked article headline
```

The mobile design must keep tap targets, text wrapping, source identification, and external-link behavior accessible.

## 4. Search and filters

The MVP MUST support:

- category filter;
- source filter;
- basic keyword search over normalized headline and available metadata;
- deterministic pagination or load-more cursors;
- filter state reflected in the URL where practical;
- a clear reset action.

Search results remain constrained to visible primary articles in the selected publication.

## 5. Theme and branding

- Light and dark modes are required.
- Publication name, logo, accent choices, descriptive copy, and category labels come from publication configuration.
- Theme implementation must preserve sufficient contrast and keyboard focus visibility.
- Engine code must not embed indie-author branding.

## 6. External destination behavior

- The original article URL is the primary destination.
- The UI must not imply that the platform authored the linked article.
- External navigation must be visually or accessibly understandable.
- Redirector/tracking links are unnecessary for MVP unless separately approved and documented.
- Broken-link handling must not silently substitute a different article.

## 7. Public article detail pages

A platform-hosted detail page is optional for MVP. If implemented, it may display normalized metadata, source attribution, categories, and duplicate provenance, but the primary read action must remain the original article link. It must not reproduce full article content without an explicit content-rights contract.

## 8. Admin information architecture

The administrative area SHOULD contain:

- Dashboard
- Publications
- Sources
- Articles
- Duplicate review
- Categories and relevance rules
- Collection runs
- Audit log
- Settings

A single-publication MVP may simplify navigation while preserving publication-scoped data boundaries.

## 9. Source management UI

Administrators MUST be able to view and change:

- source name, site URL, approved domains, state, and default category;
- endpoint URL, type, parser configuration, interval, and state;
- last attempt, last success, next expected check, and health;
- recent run outcomes and bounded error details;
- manual check-now action;
- pause, enable, and disable actions.

Dangerous changes must require appropriate confirmation and audit logging.

## 10. Article management UI

Administrators MUST be able to:

- search and filter all stored article instances;
- distinguish visible primaries, hidden articles, and duplicate-suppressed members;
- edit display metadata without losing original values/provenance;
- hide, restore, pin, and categorize;
- inspect source, endpoint, run, and relevance reasons;
- enter duplicate merge/split workflows.

## 11. Duplicate review UI

The review interface SHOULD place candidate articles side by side with:

- titles and normalized titles;
- source names;
- URLs;
- publication times;
- summaries where available;
- match signals and confidence;
- current primary selection;
- merge, split, dismiss, and choose-primary controls.

## 12. Authentication and authorization UX

- Public readers do not authenticate in the MVP.
- Admin routes require authentication.
- Unauthorized users receive no administrative data.
- Session expiry and failed actions are clearly communicated.
- Future multi-publication roles must not be blocked by assumptions that every admin owns every publication.
