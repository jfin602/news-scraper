# Article Lifecycle and Deduplication Contract

## Core rule: visibility and duplicate role are separate

Article moderation/visibility and duplicate-group membership are orthogonal dimensions.

Visibility states:
- `visible`;
- `hidden`;
- `archived`.

Duplicate roles:
- `ungrouped`;
- `primary` member of a Duplicate group;
- `non_primary` member of a Duplicate group.

Joining/leaving a Duplicate group does not inherently change visibility. Hiding/restoring an Article does not inherently change group membership.

## Candidate processing outcomes

Once Article persistence exists, every normalized candidate ends with exactly one processing outcome:

- `created` — new Article persisted;
- `updated` — existing Article Source-derived values changed;
- `unchanged` — existing Article observed without material change;
- `rejected` — invalid or unsafe before acceptance;
- `excluded` — deterministically excluded by Relevance policy;
- `failed` — item-level processing failure.

Accepted processing may additionally produce orthogonal effects:

- `visibility_hidden`;
- `duplicate_review_created`;
- `duplicate_grouped`.

Effects do not replace processing outcomes. A newly created Article may also be grouped as a duplicate in the same run.

Every observation preserves sufficient endpoint/run provenance and deterministic reasons.

## Article identity versus duplicate identity

These are different questions:

- **Article identity:** Have we already stored this Source instance?
- **Duplicate identity:** Does this separately stored Article represent the same underlying published item as another separately stored Article?

Identity resolution prevents repeated polling from inserting the same Source Article. Duplicate grouping suppresses redundant public rows while retaining each separately stored Source instance.

## Article identity order

Identity SHOULD evaluate:

1. reliable immutable Source external identifier within the same Source;
2. canonical URL within Publication/Source scope;
3. explicit stable endpoint identity key;
4. conservative fingerprint corroboration.

Fuzzy-title matching alone must never overwrite an Article.

## Duplicate classes

### Exact repeat
The same Source item is encountered again. This is Article identity, not a new Duplicate-group member.

### Alternate URL from the same Source
Tracking/print/mobile/listing aliases may converge on one Article identity when canonicalization is reliable.

### Republished or syndicated identical item
Separate Article instances reproduce the same underlying published item. These may form one Duplicate group while all Articles remain stored.

### Related coverage
Different reporting about the same event/subject is not a true duplicate and remains separately visible.

### Updated/corrected Article
A Source updates an existing Article. Source-derived values update on the existing Article and an Article observation records the event. It is not a new Article unless the Source intentionally publishes a distinct identity.

## Duplicate candidate detection

Signals may include:

- exact canonical URL across separate Article instances;
- explicit canonical/syndication metadata;
- normalized title equality;
- high title similarity within a bounded time window;
- matching author/date/summary fingerprints;
- known syndication metadata.

Signals used for **Article identity** must not be mislabeled as true-duplicate logic. A shared external identifier is a cross-Article duplicate signal only when known to be meaningful across those separate Source instances.

Weak similarity creates or updates a persisted Duplicate review candidate rather than suppressing an Article silently.

## Duplicate review persistence

A Duplicate review candidate stores:

- compared Article pair;
- match signals/reason codes;
- confidence;
- state such as `pending`, `dismissed`, `merged`, `superseded`;
- automatic/manual origin;
- administrator identity/time for manual decisions.

A dismissed candidate does not reappear indefinitely from unchanged evidence. Reconsideration requires materially new evidence or explicit administrator action.

## Primary selection

A Duplicate group has exactly one Primary Article.

Default selection SHOULD consider, in order:

1. administrator override;
2. explicit original-publisher/canonical metadata;
3. Publication-scoped Source priority;
4. metadata completeness and destination URL quality;
5. earliest credible publication time;
6. stable deterministic tie-breaker.

Changing Primary does not delete Articles or change membership.

If the current Primary becomes hidden, the group remains valid. Ordinary public output may contain no row from that group until a visible Primary is selected intentionally; duplicate logic does not silently override moderation visibility.

## Public-feed eligibility

Ordinary feed rows include Articles that are:

- `visible`, and
- either `ungrouped` or the `primary` member of a Duplicate group.

Visible `non_primary` members are duplicate-suppressed from ordinary rows but remain administratively available.

Related coverage remains separate.

The MVP may show a non-interactive “also reported by” count derived from group membership, but must not emit redundant rows.

## Manual moderation

Administrators MUST be able to:

- merge selected Articles into a Duplicate group;
- split one or more members;
- choose Primary;
- dismiss a Duplicate review candidate;
- inspect automatic signals/confidence/reasons;
- hide/restore Articles independently of duplicate role;
- record audit events for each action.

Manual decisions override automatic grouping/review outcomes until intentionally revised.

## False-positive safeguards

The system MUST avoid aggressive suppression when:

- titles are generic/recurring;
- publication times are far apart;
- URLs identify distinct Articles;
- one Article is analysis and another an announcement;
- a Source reuses identifiers incorrectly;
- only topic similarity is present.

When uncertain, preserving two visible Articles is preferable to hiding distinct reporting.
