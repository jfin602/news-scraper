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

Joining or leaving a Duplicate group does not inherently change visibility. Hiding/restoring an Article does not inherently change group membership.

## Candidate lifecycle

A normalized Article candidate ends processing with one canonical outcome:

- `created` — a new Article is persisted;
- `updated` — an existing Article's source-derived values change;
- `unchanged` — an existing Article is observed without material change;
- `rejected` — invalid or unsafe;
- `excluded` — deterministically excluded by relevance policy;
- `hidden` — persisted/accepted but hidden by publication/moderation policy;
- `duplicate_grouped` — a separately stored Article is attached to a true Duplicate group;
- `failed` — item-level processing failed.

Every observation preserves sufficient endpoint/run provenance and deterministic reasons.

## Article identity versus duplicate identity

These are different questions:

- **Article identity:** Have we already stored this Source instance?
- **Duplicate identity:** Does this separately stored Article represent the same underlying published item as another separately stored Article?

Identity resolution prevents repeated polling from inserting the same Source Article. Duplicate grouping suppresses redundant public rows while retaining each separately stored Source instance.

## Article identity order

Identity SHOULD evaluate:

1. reliable immutable Source external identifier in Source scope;
2. canonical URL in Publication/Source scope;
3. explicit stable endpoint identity key;
4. conservative fingerprint corroboration.

Fuzzy-title matching alone must never overwrite an Article.

## Duplicate classes

### Exact repeat
The same Source item is encountered again. This is Article identity, not a new Duplicate-group member.

### Alternate URL from the same Source
Tracking/print/mobile/listing aliases may converge on one Article identity when canonicalization is reliable.

### Republished or syndicated identical item
Separate Article instances from one or more Sources reproduce the same underlying published item. These may form one Duplicate group while all Articles remain stored.

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

Signals used for **Article identity** must not be mislabeled as true-duplicate logic. A shared external identifier is only a cross-Article duplicate signal when the identifier is known to be meaningful across those Source instances; otherwise it remains Source-scoped identity evidence.

Weak similarity creates or updates a persisted Duplicate review candidate rather than suppressing an Article silently.

## Duplicate review persistence

A Duplicate review candidate stores:

- compared Article pair;
- match signals and deterministic reason codes;
- confidence;
- state such as `pending`, `dismissed`, `merged`, or `superseded`;
- automatic/manual origin;
- administrator identity/time for manual decisions.

A dismissed candidate must not reappear indefinitely from the same unchanged evidence. It may be reconsidered only when materially new evidence or an explicit administrator action warrants it.

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

If the current Primary becomes hidden, the group remains valid. Public-feed eligibility may select no row from that group until an administrator or deterministic policy chooses another visible Primary; hidden state is not silently overridden by duplicate logic.

## Public-feed eligibility

Ordinary feed rows include Articles that are:

- `visible`, and
- either `ungrouped` or the `primary` member of a Duplicate group.

Visible `non_primary` members are duplicate-suppressed from ordinary feed rows but remain available administratively.

Related coverage remains separate.

The MVP may show an optional non-interactive “also reported by” count derived from group membership, but it must not emit redundant rows.

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
