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
- The existing customer installation uses sibling directories named `ns-integration` and `ns-private`; `ns-integration` is the replaceable integration package and `ns-private` owns the existing private configuration/state that must be preserved across the Phase 1 upgrade.
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
preserve ns-private configuration/state
replace ns-integration as one package operation
```

This is a planning target, not yet a locked implementation contract except where a decision below is explicitly marked LOCKED.

## Cross-cutting Profile AI administration requirement

**Status:** LOCKED — owner-approved 2026-08-28

Each Distribution Profile gains a dedicated **AI** section in the protected admin control plane. AI behavior remains Profile configuration rather than hard-coded shared-engine subject logic.

For the Phase 1 digest, the Profile AI section must provide the key safe configuration and operational controls decided by this worksheet, including at minimum:

- enable/disable the Profile digest independently of ordinary Profile Article distribution;
- configure the bounded digest lookback window;
- configure the bounded maximum digest Article count;
- expose the digest evaluation schedule/cadence in a bounded operator-friendly form consistent with Decision 2;
- manually request digest generation/evaluation through the same governed server-side generation path used by scheduled work;
- show enough current digest status/freshness information for an administrator to understand whether a valid digest exists and when it was last generated.

Later worksheet decisions may add further safe Profile-level controls such as presentation/output options. Gemini credentials/API secrets are deployment/operator secrets and MUST NOT become Profile fields or be exposed by this AI section. Provider/model configuration should remain outside subject-specific Profile behavior unless a later explicit decision makes a bounded value Profile-configurable.

Manual generation is an administrative operation only. It does not create a browser-side Gemini path and does not weaken canonical Profile grounding, input bounds, output validation, or failure isolation.

---

## Decision 1 — Customer upgrade / installation model

**Status:** LOCKED — owner-approved 2026-08-28

### Question

What exact set of steps should the existing customer perform to enable the Gemini summary after News Scraper Phase 1 ships?

### Answer

Use a whole-package replacement of the existing `ns-integration` directory while preserving the sibling `ns-private` directory unchanged.

Target customer experience:

1. use the News Scraper admin panel to download the current version-matched PHP integration ZIP;
2. replace the existing `ns-integration` directory with the newly downloaded `ns-integration` package as one upgrade operation;
3. leave `ns-private` untouched so the existing private configuration, bearer credential, state root/LKG data, and other customer-specific private state remain in place;
4. keep the existing synchronization cron/job and current site integration wiring unchanged where compatible;
5. after the folder swap, the existing customer site must continue rendering the normal Article feed without requiring separate presentation-file replacement solely because the integration runtime was upgraded;
6. the upgraded integration may then expose/render the new synchronized digest through the existing integration boundary as later worksheet decisions define.

The Phase 1 customer upgrade MUST NOT require a separate Gemini add-on, Gemini/API secret on the customer host, new News Scraper machine credential, new customer database, new cron job, or second customer-side synchronization system merely to receive/display the digest.

The admin panel package-download control MUST visibly identify the exact integration package version being offered so the customer/operator can confirm what version they are about to install. The downloaded package's own version metadata remains the authoritative artifact identity; the admin display must agree with it rather than maintaining a separate manually typed version label.

Backward compatibility is part of this decision: swapping `ns-integration` must not require clearing or rebuilding `ns-private`, and pre-digest local state must remain a valid upgrade starting point.

---

## Decision 2 — Digest generation trigger and cadence

**Status:** LOCKED — owner-approved 2026-08-28

### Answer

Digest generation is independent of endpoint collection timing. Collection remains desynchronized per endpoint: each endpoint follows its own due/runtime state, so Phase 1 must not attempt to identify or create a global "all Sources just finished" collection moment.

The server performs **two scheduled digest evaluations per day** for each enabled Profile digest. A scheduled evaluation does not automatically call Gemini.

At each evaluation:

1. resolve the current bounded digest input through canonical governed Profile output;
2. compare that current input with the input recorded for the latest successful valid digest;
3. if no Article has newly entered the current bounded governed digest input, keep the existing digest and make no Gemini request;
4. if at least one Article has newly entered that input, one new Article is sufficient to justify generating a new digest;
5. multiple Article arrivals and independently timed Source collections accumulate naturally until the next scheduled evaluation, producing at most one scheduled regeneration for that evaluation rather than one Gemini call per collected Article.

The regeneration threshold is based on Articles newly entering the **current bounded governed digest input**, not merely on any newly persisted Article anywhere in the database. An Article that is newly stored but outside the Profile or outside the bounded digest input does not by itself justify regeneration.

Canonical eligibility changes are a correctness exception to the normal new-Article threshold. If an Article supporting the current digest is no longer allowed by the current governed Profile state because of moderation, duplicate/Primary changes, Profile membership/filter changes, Source lifecycle/trust changes, or another canonical eligibility change, the system must not continue treating that digest as valid merely because no new Article arrived. The exact regenerate-versus-suppress lifecycle for this condition will be resolved in later digest lifecycle/reference decisions.

The twice-daily evaluation schedule is logically independent from collection execution and collection failure. Gemini failure cannot fail Source collection or ordinary Article distribution.

An administrator may request manual digest generation/evaluation from the Profile AI admin section, but it must use the same governed generation path rather than a separate synchronous implementation. Exact manual-force semantics, including whether an operator may deliberately regenerate unchanged input, may be finalized with the admin/lifecycle design.

---

## Decision 3 — Digest input Article set

**Status:** LOCKED — owner-approved 2026-08-28

### Answer

The initial digest input is a deterministic narrowing of the canonical governed Profile result, preserving canonical Profile order rather than introducing AI ranking or a second selector.

Default Profile AI configuration:

- **lookback window:** 7 days;
- **maximum input Articles:** 20.

Both are Profile-level AI configuration exposed in the protected Profile AI admin section. They must remain bounded. The initial maximum Article setting is **1–20**, with 20 as the default and hard Phase 1 ceiling. The lookback control must likewise have an application-owned safe finite bound; its exact allowed minimum/maximum may be finalized during implementation planning without changing the owner-approved 7-day default.

For each digest evaluation:

1. start from Articles already selected through canonical Profile eligibility/filter/order semantics;
2. keep only Articles whose `effectiveFeedDate` falls within the configured rolling lookback window;
3. take at most the configured maximum count from the front of canonical Profile order;
4. preserve that canonical order in the AI input.

Input cardinality behavior:

- 0 qualifying Articles: do not generate a new digest;
- 1 qualifying Article: sufficient input for a digest;
- 2 through the configured maximum: use all qualifying Articles;
- more than the configured maximum: use only the newest bounded set in canonical Profile order.

The normalized per-Article Gemini context is limited to useful safe outward data:

- `articleId`;
- headline;
- Source display name;
- `effectiveFeedDate`;
- `publishedAt` when available;
- author when available;
- bounded persisted summary when available;
- effective outward Categories;
- exact stored `originalUrl`.

Do not send image URLs, Source/endpoint configuration, collection/run internals, duplicate mechanics, moderation/Relevance internals, private persistence identifiers, credentials, or unrelated Profiles merely because they exist.

For Gemini URL Context, Phase 1 may supply the exact stored `originalUrl` for every Article in the bounded digest input, subject to the same application-owned maximum of 20. URL Context does not expand the governed URL set: user text, Source/retrieved text, or model output cannot add destinations. The bounded normalized summary remains present as fallback context even when URL Context is attempted.

The configured lookback/count values define the current bounded digest input used by Decision 2's regeneration comparison. Changing either Profile AI setting therefore changes the governed digest input definition and must be treated as requiring reevaluation of the existing digest rather than waiting indefinitely for a newly collected Article.

---

## Decision 4 — Gemini digest output shape and size

**Status:** OPEN

### Questions

- What should the visible digest contain: one summary paragraph, multiple paragraphs, themes, bullets/highlights, or a combination?
- What hard length bounds should apply to generated text and each structured subfield?
- Should Gemini return supporting Article IDs for themes/highlights?
- What wording/tone is generic enough to work for every Profile subject without topic-specific code?
- How should AI-generated origin be labeled?
- Which safe output/presentation preferences, if any, should be configurable from the Profile AI admin section?

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
- What digest health/status facts should appear in the Profile AI admin section?

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

- What exact archive/directory shape should the admin-panel download use so the customer can replace `ns-integration` as one package operation?
- Which existing files/directories must never be overwritten because they belong to `ns-private` and contain private config or LKG state?
- Can the integration package include a purpose-built upgrade/readme checklist for this release?
- How should the admin panel display the exact integration package version offered by the download button, and how is that display tied to authoritative package metadata?
- What preflight/rollback instructions should be given to a non-developer customer?
- How can the client verify the summary is installed correctly without server-shell expertise?

### Answer

_TBD_

---

## Completion gate for this worksheet

This worksheet is complete when Decisions 1–12 and the cross-cutting Profile AI administration requirement have owner-approved answers detailed enough that `/prompt-ass Phase 1` can decompose implementation without inventing customer-install, digest-lifecycle, revision, API, PHP, admin-control, or presentation semantics.

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
