# Public Feed and Admin Contract

## Public-feed purpose

The public experience is a fast, readable index of recent relevant headlines. It promotes discovery and sends readers to the original publisher.

## Feed eligibility

Ordinary public rows require all of the following:

- the owning Publication has `public_status = public`;
- the owning Source has approval state `approved` and lifecycle state `active`;
- the Article is `visible`; and
- the Article is either `ungrouped` or the `primary` member of a Duplicate group.

Visible `non_primary` members remain stored and administratively accessible but are duplicate-suppressed from ordinary rows. Hidden/archived Articles are not feed-eligible.

Before duplicate grouping exists, visible persisted Articles are logically `ungrouped` and therefore use the same eligibility rule rather than a temporary feed-only exception. Phase 8 MUST NOT invent duplicate-group/role persistence before the duplicate-grouping roadmap phase.

Collection eligibility and public-feed eligibility are separate. `active_for_collection`, Source operational state (`enabled`/`paused`/`disabled`), endpoint operational/lifecycle/health state, and the success/failure of current collection attempts do not by themselves suppress an already-persisted otherwise-eligible Article. Retained provenance remains readable while collection is paused or failing. Source approval and Source lifecycle remain public-row trust/lifecycle gates as stated above.

## Phase 8 basic public-feed backend

Phase 8 introduces the first public Article read path through the Web/API process. The canonical basic endpoint is:

`GET /api/publications/:publicationSlug/feed`

The endpoint MUST:

- resolve one Publication by its stable slug;
- expose rows only when that Publication has `public_status = public`;
- apply the canonical feed-eligibility rule above in the database-backed read path;
- return a bounded server-defined recent window rather than an unbounded Article set;
- use deterministic effective-feed-date ordering;
- return `200` with an empty item list when a public Publication exists but has no eligible Articles;
- treat a missing Publication and a non-public Publication equivalently as `404` on the public surface;
- return bounded generic dependency/read failures without SQL, stack traces, database connection details, or other secrets;
- require no reader authentication.

The Phase 8 item read model is intentionally small. Each item exposes only the fields needed by the basic feed:

- stable Article identifier;
- effective feed date;
- feed-date source: `published_at` or fallback `first_seen_at`;
- Article `display_title` as the headline;
- Source display name;
- stored Article `original_url` as the external destination.

The response MAY include minimal Publication identity needed by the Phase 9 basic UI, such as stable Publication identifier, slug, and name. It MUST NOT expose Raw items, Article observations, internal identity digests, normalized-title matching fields, database internals, unbounded summaries/content, or other fields merely because they are stored.

Keyword search, Source/Category filters, client-controlled cursor/load-more behavior, ranking, and presentation/theme behavior are not part of this Phase 8 endpoint. Phase 12 adds deterministic discovery/pagination behavior without changing the eligibility rule.

## Feed date and ordering

The canonical effective feed date is:

1. trusted parsed `published_at` when present;
2. otherwise `first_seen_at`.

The read model MUST expose which source produced the effective date so fallback use is detectable. Missing or invalid Source publication dates do not become fabricated `published_at` values.

Ordinary rolling-feed ordering is deterministic and reverse chronological by effective feed date. For equal effective dates, Phase 8 orders by `first_seen_at` descending and then stable Article identifier as the final deterministic tie-breaker. Later discovery/pagination work MUST preserve a documented stable ordering compatible with this baseline.

Pinning/featured-story ordering is deferred beyond MVP. MVP chronological ordering therefore has no pin exception.

## Desktop feed

The default desktop presentation MUST support the customer's core three-column concept:

| Date | Headline | Source |
|---|---|---|
| Aug. 6, 2026 | Linked original headline | Source name |

Requirements:

- reverse-chronological ordering by effective feed date;
- headline is dominant interactive element;
- headline links directly to the Article's stored `original_url`;
- Source identity is clear;
- date formatting follows Publication settings once those presentation settings exist;
- loading, empty, and error states are explicit.

## Mobile feed

Mobile MUST not force a compressed desktop table. A compact stacked item is appropriate:

```text
AUG 6 · SOURCE NAME
Linked article headline
```

Tap targets, wrapping, Source identification, and external-link behavior must remain accessible.

The tech-demo milestone may use a basic mobile layout before the later presentation-polish phase completes the full accessibility/responsive pass.

## Search and filters

Completed MVP MUST support:

- Category filter;
- Source filter;
- keyword search over normalized/display headline and available safe metadata;
- deterministic pagination/load-more cursors;
- filter state reflected in URL where practical;
- clear reset action.

Search results use the same feed-eligibility rule as the rolling feed. These discovery features are not blockers for the earlier basic-feed tech demo.

## Theme and branding

Completed MVP requires:

- light/dark modes;
- Publication name/logo/accent/descriptive copy/Category labels from Publication configuration;
- accessible contrast and keyboard focus;
- no indie-author branding embedded in shared engine/UI logic.

Final theme/branding polish follows the basic public-feed tech-demo milestone as defined by the roadmap.

## External destination behavior

- The Article's stored `original_url` is the primary public destination.
- `canonical_identity_url` is an identity-comparison field and MUST NOT silently replace `original_url` as the public headline destination.
- A future separately governed Source-derived public/canonical destination field may change this only through an explicit contract decision; none exists in Phase 8.
- UI must not imply Platform authorship of linked content.
- External navigation is visually/accessibly understandable.
- Redirector/tracking links are not MVP behavior unless separately approved/documented.
- Broken-link handling never silently substitutes another Article.

## Public Article detail pages

A Platform-hosted detail page is optional in MVP. If implemented, it may show normalized metadata, Source attribution, Categories, and duplicate provenance, but the primary read action remains the Article's stored `original_url`. Full Article content is not reproduced without a separate rights contract.

## Admin delivery model

The aggregation vertical slice and basic public feed are implemented before the full administrative control plane.

Initial Publication/Source configuration MAY be supplied through approved operator-maintained bootstrap/seed tooling until the corresponding admin screens exist. That mechanism does not bypass Source approval or other collection eligibility rules.

Ordinary bootstrap remains create-if-absent and MUST NOT overwrite existing operator-managed Publication state. Before Publication administration exists, the tech-demo path therefore requires an explicit operator-controlled, topic-independent way to change an existing Publication's `public_status` deliberately. Changing committed bootstrap input alone is not a state-transition mechanism for an already-created Publication. Phase 8 may provide the smallest safe operator mechanism needed for this transition; it does not create the later full Publication-admin surface.

When administrative UI/API routes are introduced, they are protected by Cloudflare Access under `docs/decisions/cloudflare-access-admin-perimeter.md`.

## Admin information architecture

Administrative area SHOULD eventually contain:

- Dashboard;
- Publications;
- Sources;
- Articles;
- Duplicate review;
- Categories and Relevance rules;
- Collection runs;
- change/audit history;
- Settings.

A single-Publication MVP may simplify navigation while preserving Publication/resource ownership and data-scoping boundaries.

## Source management UI

Once the Source-administration phase is complete, authorized operators MUST be able to view/change:

- Source name/site URL/approved domains/Source priority/default Category;
- Source approval state and operational state;
- endpoint URL/type/parser configuration/poll interval;
- endpoint approval state and operational state;
- endpoint domain restrictions/default Category override;
- last attempt/last success/next expected check;
- derived endpoint health separately from operational state;
- recent Collection-run outcomes and bounded errors;
- manual check-now;
- approve/unapprove, enable, pause, disable, and archive/state-management actions as permitted.

Physical deletion is not generic CRUD behavior when retained provenance depends on the Source/endpoint.

## Article management UI

Once the Article-moderation phase is complete, authorized operators MUST be able to:

- search/filter all stored Article instances;
- distinguish ungrouped Articles, Primary members, non-primary members, hidden Articles, and archived Articles;
- inspect Source, endpoint, Collection-run observations, and Relevance reasons;
- edit optional display overrides without replacing/loss of current normalized Source-derived values;
- clear an override to reveal latest normalized Source value;
- hide/restore and categorize Articles;
- enter Duplicate review/merge/split workflows.

Source updates never silently clobber an active admin display override.

## Duplicate review UI

Review SHOULD place candidate Articles side-by-side with:

- titles/normalized titles;
- Source names;
- URLs;
- publication times;
- summaries where available;
- match signals/confidence/reasons;
- current duplicate role/Primary selection;
- merge, split, dismiss, and choose-Primary controls.

Dismissed decisions persist so unchanged evidence does not repeatedly recreate the same review work.

## Administrative access and request integrity

- Public readers do not authenticate in MVP.
- All MVP admin UI and admin API routes require the Cloudflare Access perimeter.
- Supported deployments MUST prevent direct-origin access from bypassing that perimeter.
- The MVP application does not implement native administrator accounts, login/logout sessions, account recovery, roles, or per-user Publication authorization.
- State-changing admin browser actions MUST use CSRF protection or an equivalent request-integrity control.
- Administrative commands MUST validate Publication/resource ownership and domain invariants even without per-user Publication permissions.
- Administrative errors must not expose secrets, stack traces, or raw database details.

## Change history

Security-sensitive configuration and moderation changes SHOULD produce bounded application change/audit records sufficient to explain material actions, including Source/endpoint state/approval changes, Article visibility/overrides/Categories, and Duplicate review/group changes.

MVP change records do not require a stable native administrator identifier or guaranteed per-user attribution. Cloudflare identity/access logs are operational evidence rather than the application's canonical domain identity.
