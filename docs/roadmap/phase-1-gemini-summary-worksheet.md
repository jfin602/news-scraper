# Phase 1 Gemini Summary Worksheet

**Status:** OPEN PLANNING WORKSHEET  
**Roadmap:** 3.0 / Phase 1 — Gemini Profile digest foundation  
**Current package baseline:** `2.1.0`  
**Purpose:** Resolve the operational, distribution, PHP-upgrade, and presentation decisions for scheduled Gemini-powered Profile summaries before the formal `/prompt-ass` → `/prompt-plan` → `/prompt-write p2-1` workflow begins.

This file is intentionally non-normative while items remain open. It records owner decisions as they are made so the later Phase 1 planning workflow can consume one coherent source instead of reconstructing decisions from chat history.

Governing behavior remains in the current contracts and roadmap. If a worksheet answer conflicts with a governing contract, the conflict must be resolved through the normal documentation/contract workflow before implementation prompts are written.

## Locked starting constraints

- Gemini digest generation runs server-side in News Scraper, never in the customer's public PHP visitor path.
- Gemini/API secrets must never be installed on the customer website or exposed to browser code.
- The customer already has the generic PHP integration installed and operational.
- The owner will not be physically present with the customer when this feature launches.
- Customer deployment therefore needs to be simple enough for a remote, low-friction install.
- Ordinary visitor rendering must remain local-only and must not call Gemini or News Scraper merely to display the latest summary.
- Existing Article feed behavior, PHP LKG behavior, direct publisher links, Source trust, Profile semantics, and non-AI operation must remain usable if Gemini is disabled or unavailable.
- Existing persisted `Article.summary` input is already bounded by the accepted N6WD 4,000-code-point invariant; Phase 1 consumes that behavior rather than reimplementing it.
- The permanent v1 distribution API permits compatible additive fields.
- The currently installed PHP client tolerates unknown top-level response fields, so server-side digest fields can be introduced before the customer upgrades their PHP package without breaking the existing Article sync path.

## Working architectural baseline

The current preferred rollout shape is:

```text
News Scraper scheduled Gemini job
→ durable active Profile digest
→ compatible additive v1 Profile response field
→ existing scheduled PHP synchronization
→ validated local LKG/local-read digest state
→ customer server-rendered summary
```

Preferred customer-upgrade objective:

```text
no Gemini key on customer host
no new News Scraper machine credential
no new customer database
no new scheduled Gemini job
no new public upstream dependency
preserve existing private config/state
replace/update integration runtime
minimal customer presentation-file change
```

This is a planning target, not yet a locked implementation contract.

---

## Decision 1 — Customer upgrade / installation model

**Status:** OPEN

### Question

What exact set of steps should the existing customer perform to enable the Gemini summary after News Scraper Phase 1 ships?

### Current recommendation

Use an in-place/drop-in PHP integration upgrade that preserves the customer's existing private configuration, bearer credential, state root, and cron schedule.

Target customer experience:

1. download/extract the new version-matched integration package;
2. replace the existing integration runtime/package files;
3. leave private configuration and existing synchronized state untouched;
4. keep the existing Article synchronization cron/job unchanged where safely possible;
5. upload/replace at most one simple PHP presentation/include file to display the synchronized digest.

Avoid requiring a separate Gemini add-on, new Gemini/API secret, new News Scraper machine credential, new database, or second customer-side synchronization system merely to display the digest.

### Answer

_TBD_

---

## Decision 2 — Digest generation trigger and cadence

**Status:** OPEN

### Questions

- What server-side event/job generates the digest?
- Should generation run once or twice daily by default?
- Should it be tied to the existing collection/publication refresh schedule or be an independent scheduled job?
- What prevents needless regeneration when the governed Profile input has not materially changed?
- Should administrators be able to trigger a manual regeneration?

### Answer

_TBD_

---

## Decision 3 — Digest input Article set

**Status:** OPEN

### Questions

- How many recent canonically governed Profile Articles should be eligible for one digest?
- What time window, if any, should constrain the input?
- Should the input be purely the first N Articles from canonical Profile order, or use another deterministic bounded rule?
- How should empty/very-small feeds behave?
- What exact bounded metadata is sent for each Article?
- How many exact stored `originalUrl` values should be supplied to Gemini URL Context?

### Answer

_TBD_

---

## Decision 4 — Gemini digest output shape and size

**Status:** OPEN

### Questions

- What should the visible digest contain: one summary paragraph, multiple paragraphs, themes, bullets/highlights, or a combination?
- What hard length bounds should apply to generated text and each structured subfield?
- Should Gemini return supporting Article IDs for themes/highlights?
- What wording/tone is generic enough to work for every Profile subject without topic-specific code?
- How should AI-generated origin be labeled?

### Answer

_TBD_

---

## Decision 5 — Digest revision and Article snapshot interaction

**Status:** OPEN

### Problem

The current PHP synchronization uses Profile `snapshotRevision`, `ETag`, `If-None-Match`, and `304 Not Modified`. If a digest changes while the Article set remains unchanged, an Article-only revision could cause the customer to receive `304` and never download the new digest.

### Questions

- Should active digest state participate in the existing outward Profile `snapshotRevision`/ETag?
- If yes, does every new valid digest cause a complete Profile snapshot refresh on the next PHP sync?
- If no, what independent revision/conditional mechanism carries digest changes without creating a competing synchronization architecture?

### Current recommendation

Use one outward revision concept that reflects both the canonically distributed Article state and the currently active digest state. A newly activated digest changes the Profile response revision/ETag, causing the existing PHP synchronization path to receive the updated complete snapshot.

### Answer

_TBD_

---

## Decision 6 — Persistence and previous-good-digest lifecycle

**Status:** OPEN

### Questions

- What durable database entity owns a Profile digest?
- Do we retain historical generations or only active + attempt metadata?
- What identifies the canonical input snapshot used to generate it?
- What happens on Gemini timeout, rate limit, malformed output, safety rejection, or URL Context degradation?
- When is the previous valid digest retained?
- How are absent, current, stale, and failed-generation states represented?

### Answer

_TBD_

---

## Decision 7 — v1 API representation

**Status:** OPEN

### Questions

- What exact optional top-level field should expose the digest?
- Which digest provenance/freshness fields belong in the machine response?
- Should the field always exist as nullable, or be omitted when unsupported/absent?
- How do old PHP clients safely ignore it?
- What validation protects Article delivery if digest data is malformed internally?

### Answer

_TBD_

---

## Decision 8 — PHP LKG and local-read representation

**Status:** OPEN

### Questions

- How is the digest stored inside the complete synchronized local snapshot?
- What validation bounds are required before activation?
- Can invalid digest data be dropped while preserving otherwise valid Article LKG, or must the upstream response already guarantee a safe nullable digest?
- What normalized PHP class/value-object should `LocalProfileReader` expose?
- How should digest generation time/age be represented to customer code?

### Answer

_TBD_

---

## Decision 9 — Customer-facing PHP rendering interface

**Status:** OPEN

### Questions

- What is the smallest customer-side code change required to display the digest?
- Should the integration package ship a dedicated digest renderer/helper, expose only normalized local-read data, or both?
- Can the customer update one existing include/template file rather than editing several pages?
- Should the existing fallback renderer gain optional digest rendering, or should digest presentation stay opt-in?

### Answer

_TBD_

---

## Decision 10 — Stale, absent, and failed summary presentation

**Status:** OPEN

### Questions

- If there has never been a valid digest, should the summary block disappear entirely or show an unavailable message?
- How old can a valid digest be before the customer should label it stale/older?
- Should a failed regeneration keep showing the prior digest with its original generation timestamp?
- Should failure details ever be exposed publicly, or only in admin/operator diagnostics?

### Answer

_TBD_

---

## Decision 11 — Supporting Article references and links

**Status:** OPEN

### Questions

- Should the digest contain explicit supporting Article references?
- If highlights/themes reference Articles, how many references are allowed per item?
- Should customer rendering show links inline, below the digest, or not at all initially?
- How are model-returned Article IDs validated against the exact Profile context?
- All visible links must continue to resolve from the stored governed `originalUrl`, never model-generated URLs.

### Answer

_TBD_

---

## Decision 12 — Customer upgrade package and remote install instructions

**Status:** OPEN

### Questions

- What exact files/directories does the customer replace?
- Which existing files/directories must never be overwritten because they contain private config or LKG state?
- Can the integration package include a purpose-built upgrade/readme checklist for this release?
- Can the update be reduced to an archive upload/extract plus one website PHP file replacement?
- What preflight/rollback instructions should be given to a non-developer customer?
- How can the client verify the summary is installed correctly without server-shell expertise?

### Answer

_TBD_

---

## Completion gate for this worksheet

This worksheet is complete when Decisions 1–12 have owner-approved answers detailed enough that `/prompt-ass Phase 1` can decompose implementation without inventing customer-install, digest-lifecycle, revision, API, PHP, or presentation semantics.

After all answers are locked:

1. review the completed worksheet against current AI, distribution/API, PHP integration, security, and testing contracts;
2. identify any contract/roadmap amendments required by the decisions;
3. apply those approved documentation changes through the normal documentation workflow;
4. then begin the formal Phase 1 workflow:

```text
/prompt-ass Phase 1
→ /prompt-plan
→ /prompt-write p2-1
```
