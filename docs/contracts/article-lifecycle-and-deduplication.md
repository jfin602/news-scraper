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

Phase 7 establishes Article identity/persistence before public-feed visibility is consumed. Phase 8, the first phase that reads Articles for public output, introduces persisted Article visibility using the canonical states above. Existing Phase 7 Articles migrate to `visible`, and newly persisted Articles use `visible` as the baseline unless a separately implemented policy deliberately produces another visibility state. Phase 8 does not introduce moderation controls; those remain owned by the Article-moderation roadmap phase.

Before Duplicate-group persistence exists, persisted Articles are logically `ungrouped`. Phase 8 MUST NOT create speculative duplicate-role columns, groups, or memberships merely to evaluate the baseline public feed. The same eligibility law later applies once true Duplicate groups exist.

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
2. canonical URL within the same Source;
3. explicit stable endpoint identity key only when a concrete adapter requires one;
4. conservative fingerprint corroboration.

Publication identity is not part of Article identity because the supported installation contains only one Publication configuration. Fuzzy-title matching alone must never overwrite an Article.

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

Automatic grouping is permitted only from strong, deterministic evidence that identifies the same underlying published item, not merely similar subject matter. In the MVP baseline, exact canonical-identity URL equality across separately persisted Article instances is strong evidence when valid under the URL/identity contracts. Explicit trustworthy canonical, syndication, or original-publisher metadata is strong only when it genuinely exists through a governed Source/adapter contract.

Phase 16 MUST NOT invent speculative metadata fields, fetch or scrape Article bodies, heuristically infer an original publisher, or pretend unavailable syndication metadata exists to improve grouping.

The following are weak corroborating/review signals and MUST NOT automatically group or hide Articles by themselves:

- normalized-title equality;
- fuzzy or high title similarity;
- matching author/date/summary fingerprints;
- generic or recurring titles;
- topic/event similarity;
- other content resemblance that does not independently identify the same published item.

A bounded combination of weak signals may create or update a persisted Duplicate review candidate with deterministic confidence/reasons, but accumulating weak scores does not become automatic suppression unless a future explicit contract promotes a concrete deterministic signal. Weak evidence MUST NOT automatically merge existing Duplicate groups.

Signals used for **Article identity** must not be mislabeled as true-duplicate logic. A shared external identifier is a cross-Article duplicate signal only when known to be meaningful across those separate Source instances.

Same-Source identity conflicts MUST remain Article-identity conflicts and MUST NOT be routed through Duplicate grouping to bypass Source-scoped identity invariants.

## Duplicate review persistence

A Duplicate review candidate represents a canonical unordered Article pair so `(A, B)` and `(B, A)` cannot become separate logical candidates. Persistence and transactions MUST ensure one canonical candidate relationship per Article pair/evidence method as appropriate, idempotent reevaluation of unchanged evidence, and deterministic bounded signals, reason codes, and confidence.

A Duplicate review candidate stores:

- compared Article pair;
- match signals/reason codes;
- confidence;
- state such as `pending`, `dismissed`, `merged`, `superseded`;
- automatic/manual origin;
- manual decision time and optional reason where applicable.

Duplicate review/group records are installation-wide Article relationships and do not require Publication foreign keys or cross-Publication checks.

MVP does not require a native administrator identity on manual decisions. If native identity is added later, it may extend attribution without redefining the duplicate decision itself.

A dismissed candidate with materially unchanged deterministic evidence remains dismissed and is not recreated as pending work on every collection. A deterministic evidence/signals fingerprint or equivalent stable representation may establish whether evidence changed; the contract does not prescribe a hash or storage algorithm. Reconsideration requires materially new evidence or later explicit operator action.

Phase 16 owns this persistence model and detector behavior, including respecting persisted dismissal. Phase 17 owns the human-facing review queue and merge, split, dismiss, and choose-Primary controls; Phase 16 MUST NOT add that moderation UI merely to exercise persistence.

## Duplicate-group topology

An Article belongs to at most one Duplicate group at a time. Every Duplicate group has exactly one Primary Article, and that Primary MUST be a member of the same group. Every non-Primary Article and every Article observation/provenance record remains stored.

Repeated evidence between members already in one group is idempotent. Membership changes do not silently alter Article visibility, and changing Primary never deletes Articles, observations, or provenance.

When strong automatic evidence connects Articles in two existing groups, any justified group merge MUST be atomic and idempotent, preserve every membership and provenance record, leave no overlapping groups or duplicate memberships, and select one deterministic Primary. Weak evidence cannot automatically merge the groups. Database constraints SHOULD express critical uniqueness/integrity where possible; transactions MUST enforce invariants that no single static constraint can express.

## Primary selection

A Duplicate group has exactly one Primary Article. Phase 16 automatic selection MUST apply, in order:

1. trustworthy explicit original-publisher/canonical metadata when it genuinely exists through a governed contract;
2. the higher-preference Source under the existing Source-priority model;
3. metadata completeness and destination quality;
4. earliest credible Source publication time;
5. existing persisted timing/stable Article identity as a deterministic fallback where needed;
6. stable Article identifier as the final tie-break.

Original-publisher status MUST NOT be inferred from names, domain reputation, topic, title similarity, or other heuristics. Missing trustworthy metadata simply advances selection to the next criterion. A Phase 17 explicit manual Primary choice outranks automatic selection once moderation exists.

Source-priority/configuration changes do not authorize an installation-wide historical regrouping or Primary-reselection scan. Current configuration may be applied when a group is newly created, strongly merged, or otherwise legitimately reevaluated by governed duplicate processing.

Changing Primary does not delete Articles or change membership.

If the current Primary becomes hidden, the group remains valid. Ordinary public output may contain no row from that group until a visible Primary is selected intentionally; duplicate logic does not silently override moderation visibility.

## Public-feed eligibility

Ordinary feed rows include Articles that are:

- `visible`, and
- either `ungrouped` or the `primary` member of a Duplicate group.

Visible `non_primary` members are duplicate-suppressed from ordinary rows but remain administratively available.

Related coverage remains separate.

Source/Category filters, literal keyword search, and keyset pagination operate only over this canonical eligible stream and MUST NOT resurrect a visible `non_primary` Article or create a parallel feed-eligibility path. The public headline destination remains stored `original_url`.

The singleton Publication public-exposure gate and Source trust/lifecycle gates are defined by `docs/contracts/public-feed-and-admin-contract.md`; Article visibility/duplicate role do not replace those gates.

An “also reported by” UI is not required by Phase 16.

## Manual moderation

Once moderation UI exists, Cloudflare-authorized operators MUST be able to:

- merge selected Articles into a Duplicate group;
- split one or more members;
- choose Primary;
- dismiss a Duplicate review candidate;
- inspect automatic signals/confidence/reasons;
- hide/restore Articles independently of duplicate role;
- preserve bounded change history for material actions.

Manual decisions override automatic grouping/review outcomes until intentionally revised.

MVP change history does not require canonical per-user attribution inside the application.

## False-positive safeguards

The system MUST avoid aggressive suppression when:

- titles are generic/recurring;
- publication times are far apart;
- URLs identify distinct Articles;
- one Article is analysis and another an announcement;
- a Source reuses identifiers incorrectly;
- only topic similarity is present.

When uncertain, preserving two visible Articles is preferable to hiding distinct reporting.
