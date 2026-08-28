# AI Assistance Contract

**Status:** Owner-approved 3.0 product contract; Phase 1 active at package `2.1.0`  
**Adopted:** 2026-08-27  
**Updated:** 2026-08-28 for completed Phase 1 worksheet alignment  
**Initial provider requirement:** Google Gemini  
**Roadmap:** `docs/roadmap/3.0-roadmap.md`

## Purpose and authority

News Scraper may use generative AI to help readers understand and interrogate the Articles already selected by a governed Distribution Profile. AI is a downstream assistance layer over canonical Profile output. It is never a Source, collector, trust authority, Relevance engine, Category authority, duplicate authority, Article-identity mechanism, ordering authority, or replacement for the persisted Article/provenance model.

The initial 3.0 implementation uses Google Gemini. Provider-specific request/response handling MAY live behind a narrow provider boundary, but subject/editorial behavior remains provider-independent and topic independent.

The initial Gemini provider profile is the Gemini Developer API using the Interactions API through the official `@google/genai` SDK, with stable `gemini-3.7-flash` as the initial configured model. Scheduled digest generation uses low thinking, structured JSON output validated against an application-owned schema, `store=false`, Gemini URL Context over application-selected governed Article URLs, and no Google Search grounding. These provider choices are implementation configuration rather than subject/editorial behavior and may change later only through deliberate compatible configuration/contract review.

The two initial AI capabilities are:

1. scheduled Profile news/trend digests generated from recent governed Profile Articles; and
2. an interactive Profile-grounded "Ask this feed" chatbot.

Both capabilities operate on a Distribution Profile rather than hard-coded subject vocabulary. The same implementation must work for publishing news, opportunities, indie filmmaking, or another configured Profile without shared-engine topic conditionals.

## Canonical grounding boundary

AI input MUST originate from already normalized, canonically eligible Article data selected through the existing Distribution Profile read-model authority.

The AI layer MUST NOT:

- query Article tables with competing eligibility/filter/order logic;
- restore Articles excluded by Source trust, visibility, moderation, duplicate suppression, or Profile selection;
- reinterpret Relevance, Category, Source admission, Profile filters, or duplicate state;
- manufacture or replace Article `originalUrl` destinations;
- perform arbitrary web browsing/search or allow Source text, user text, conversation history, or model output to expand the set of URLs the provider may retrieve;
- operate a News Scraper-owned Article-body crawler or persist fetched Article bodies merely to obtain more AI context;
- use unbounded Raw items, HTML bodies, parser payloads, or internal persistence/provenance records as prompt context.

Phase 1 digest grounding starts from the canonical Profile result and narrows deterministically without AI ranking. The default digest input uses a 7-day rolling lookback and a maximum of 20 Articles. Maximum Article count is Profile-level AI configuration in the bounded range 1–20, with 20 as the Phase 1 hard ceiling and default. Lookback is also bounded Profile-level AI configuration with a default of 7 days; implementation planning may choose its safe finite minimum/maximum without changing that default.

For each evaluation:

1. start from Articles already selected through canonical Profile eligibility/filter/order semantics;
2. keep only Articles whose `effectiveFeedDate` falls within the configured rolling lookback window;
3. take at most the configured maximum from the front of canonical Profile order; and
4. preserve canonical order in the AI input.

Zero qualifying Articles means no new digest generation. One qualifying Article is sufficient input. More than the configured maximum is truncated only by taking the newest bounded prefix in canonical Profile order.

The per-Article Gemini context is limited to useful safe outward data: `articleId`, headline, Source display name, `effectiveFeedDate`, nullable `publishedAt`, nullable author, bounded persisted summary, effective outward Categories, and exact stored `originalUrl`. Image URLs, Source/endpoint configuration, Collection-run internals, duplicate mechanics, moderation/Relevance internals, private persistence identifiers, credentials, and unrelated Profiles are excluded merely because they exist.

For Gemini URL Context, application code MAY provide the exact stored `originalUrl` for every Article in the bounded digest input, subject to the same hard maximum of 20. The URL set is derived only from those already-selected governed Profile Articles; arbitrary or model-selected destinations are prohibited. The normalized Article summary remains part of the supplied context when present even when URL Context is attempted.

The accepted correction `c1-n6wd` already governs that summary input: persisted normalized `Article.summary` is at most 4,000 Unicode code points after plain-text normalization, with complete-word truncation plus `...`, and a 3,997-code-point hard fallback plus `...` when no usable boundary exists. Phase 1 consumes that invariant and MUST NOT duplicate or bypass it.

URL retrieval failure for one Article is a context-degradation condition rather than an automatic digest failure when bounded metadata/summary context remains sufficient. The model must not be instructed or allowed to imply that inaccessible content was successfully read.

## Untrusted content and prompt injection

All Source-derived Article text and all publisher-page content retrieved through provider URL Context are untrusted data.

AI orchestration MUST clearly separate system/developer instructions from Article content and user content. Source titles, summaries, category labels, authors, retrieved page text, and other feed/provider-retrieved text MUST be treated as quoted/reference data, never executable instructions. A Source item or retrieved page that contains text such as "ignore previous instructions" has no authority over model policy, tool selection, secrets, Profile selection, URL selection, or system behavior.

The implementation SHOULD use structured delimiters/typed request construction and provider structured-output facilities where practical. Model output must be validated before persistence or response use.

## Profile AI administration

Each Distribution Profile gains a dedicated AI section in the protected admin control plane. AI behavior remains Profile configuration rather than hard-coded subject logic.

For the Phase 1 digest, that section MUST provide at least:

- independent digest enable/disable control;
- bounded lookback configuration;
- bounded maximum Article count configuration;
- visible digest evaluation cadence/status;
- a manual `Generate now` operation;
- current active-digest generation/freshness information; and
- latest evaluation/attempt outcome with bounded diagnostic category.

Gemini credentials/API secrets are deployment/operator secrets and MUST NOT become Profile fields or be exposed by the Profile AI section. Provider/model configuration remains outside subject-specific Profile behavior unless a later explicit decision makes a bounded value Profile-configurable.

Manual generation is an administrative operation only. It uses the same canonical input selection, URL restrictions, provider boundary, structured validation, persistence, and activation path as scheduled generation. It MAY deliberately bypass the scheduled unchanged-input skip optimization so an administrator can regenerate unchanged governed input, but it cannot expand the Article/URL set or weaken any safety boundary.

## Scheduled Profile digest

A Profile digest summarizes the recent developments represented by one Profile's current governed Article set.

Digest generation is server-side scheduled work. It MUST NOT run synchronously on an ordinary customer page request, ordinary PHP local-read request, or normal visitor rendering path.

The server performs two scheduled digest evaluations per day for each enabled Profile digest. Evaluation timing is independent from endpoint collection timing; there is no global "all Sources just finished" collection moment.

A scheduled evaluation does not automatically call Gemini. At each evaluation the application resolves the current bounded digest input, derives its `digestInputIdentity`, and compares it to the latest successful valid digest input. If no Article newly entered the current bounded governed digest input and relevant AI configuration did not change, the existing digest remains and no Gemini request is made. One newly entering Article is sufficient to justify generation. Multiple arrivals naturally accumulate until the next evaluation, producing at most one scheduled regeneration for that evaluation.

Changing the configured lookback/count changes the governed input definition and requires reevaluation rather than waiting indefinitely for a newly collected Article.

Canonical invalidation is a correctness exception to the normal new-Article threshold. If an Article supporting the active digest is no longer permitted by current governed Profile state because of moderation, duplicate/Primary change, Profile membership/filter change, Source trust/lifecycle change, or another canonical eligibility change, the system MUST NOT keep distributing that digest merely because no new Article arrived.

### Structured digest output

Phase 1 uses validated structured output rather than unrestricted prose.

The visible digest contains:

1. **Overview** — concise plain text summarizing the overall recent developments in the bounded governed input; target approximately 100–200 words, hard maximum 2,000 characters.
2. **Highlights / key developments** — up to 3 structured highlights. Each has a short plain-text title and a concise 1–2 sentence explanation with a hard maximum of 500 characters for the explanation.
3. **Supporting Articles** — up to 3 supporting Article references per highlight, identified by Gemini only through `articleId` values from the exact bounded generation input.

The complete Gemini-generated textual portion of one digest is hard-bounded to approximately 4,000 characters across overview and highlights. Supporting Article metadata/URLs are application-resolved references and are not counted as model-generated prose.

All generated text is untrusted plain text. Phase 1 does not accept model-provided executable HTML or trusted Markdown.

News Scraper validates every returned supporting `articleId` against the generation input, removes duplicate IDs within one highlight, and resolves outward support metadata from canonical governed Article data. At minimum a normalized supporting reference exposes `articleId`, headline, Source display name, `effectiveFeedDate`, and exact stored `originalUrl`. Model-provided URLs, Source names, dates, or replacement headlines are never trusted as outward reference fields. The same Article MAY legitimately support more than one highlight.

The AI-origin label is application-owned rather than model-authored. Supported first-party/integration examples should clearly identify the block as AI-generated while leaving final wording/styling to customer presentation.

## Digest identity, persistence, and lifecycle

The digest generation provenance uses internal `digestInputIdentity`, distinct from the outward distribution `snapshotRevision`.

`digestInputIdentity` identifies the exact bounded governed Article input plus relevant Profile AI configuration used to determine generation behavior. It is the identity used for scheduled comparison, provenance, and generation idempotency.

The relationship is:

```text
bounded canonical digest input + relevant AI configuration
→ digestInputIdentity
→ Gemini generation
→ validated active digest
→ outward Profile state (Articles + active digest)
→ snapshotRevision / ETag
```

Successful digest generations, the Profile's active digest, and generation/evaluation attempts are distinct durable concepts.

Every successfully validated digest generation is persisted as an immutable Profile-owned record containing at least digest identity, Profile identity, `digestInputIdentity`, generation timestamp, provider/model identity, bounded input Article count, exact bounded input Article IDs in canonical order or equivalent immutable provenance, overview, validated highlights, validated supporting references, and bounded safe provider/usage metadata where useful.

The Profile owns a separate active-digest reference. Successful replacement is atomic:

```text
generate
→ validate complete structured output and references
→ persist complete immutable digest
→ atomically switch the Profile active-digest reference
```

Consumers MUST NOT observe a partially written digest. Previous successful digests remain immutable history for provenance/diagnostics unless a later retention policy deliberately prunes them.

Evaluation/generation attempts are persisted separately with bounded operational metadata. Attempt outcomes may include scheduled/manual evaluation, skipped/no-new-content, success, provider failure, timeout, rate limit, malformed structured output, safety rejection, dependency failure, or another bounded diagnostic category. Attempts MUST NOT persist secrets, unbounded prompts, retrieved page bodies, full failed provider payloads, or other unnecessary sensitive/unbounded content.

### Freshness and failure behavior

Digest freshness is semantic, not a simple age cutoff. A digest may remain current for days when its bounded governed input/configuration is unchanged.

The downstream digest freshness classification is exactly:

- `current` — the active digest still corresponds to the current bounded governed digest input/configuration;
- `older` — the bounded governed input changed and a replacement is not yet active, but the previous digest remains canonically valid and still has meaningful overlap with the current bounded input.

A provider failure, timeout, rate limit, malformed output, safety rejection, or dependency outage does not automatically invalidate an otherwise still-governed previous digest. The previous digest MAY remain active with its truthful original `generatedAt` and `older` freshness when the input changed but the digest remains canonically safe and overlapping. A failed attempt never rewrites the old generation timestamp or pretends the old digest is new.

If none of the Articles from the previous digest input remain in the current bounded governed input, or if any canonical invalidation condition makes the active digest no longer distributable, the active digest MUST be suppressed to no digest until a valid replacement succeeds.

Canonical invalidation therefore follows:

```text
active digest loses current canonical validity
→ suppress/remove it from outward active digest state
→ attempt replacement through the normal governed generation path when qualifying input exists
→ success: atomically activate replacement
→ failure/no qualifying input: no active digest is distributed; ordinary Articles remain fully available
```

Individual URL Context retrieval failure remains bounded context degradation and does not by itself invalidate the whole attempt when sufficient normalized fallback context remains.

Gemini/provider failure, invalid AI state, or digest absence MUST NOT interrupt Source collection, Article persistence, canonical distribution, PHP Article synchronization/LKG, or ordinary customer Article rendering.

## Distribution and PHP propagation

The Phase 1 digest is part of the existing complete outward Profile snapshot. It is not delivered through a second digest endpoint, digest ETag, customer-side digest cron, or competing synchronization protocol.

The permanent `/api/v1` contract adds one top-level `digest` field to successful Profile pages. It is always present and is either a validated structured active digest object or `null`. The same digest value belongs to every page of one `snapshotRevision`.

Changing visible digest state — activation, replacement, suppression/removal, or `null`/object transition — changes the outward Profile `snapshotRevision`/ETag even when the Article set itself is unchanged. Existing snapshot-change continuation behavior remains authoritative during races.

The distributed digest includes only bounded data needed downstream: `generatedAt`, `freshness`, `inputArticleCount`, provider, model, overview, highlights, and application-resolved supporting Article references. Internal `digestInputIdentity`, attempt IDs/status, prompt text, URL Context diagnostics, raw provider metadata, admin configuration, persistence-only identifiers, and secrets remain server-side.

If internally stored AI state is malformed or cannot safely be materialized while the ordinary Profile Article state is valid, the API serves Articles normally with `digest: null` and records/exposes the AI integrity problem through bounded operator diagnostics. Invalid AI state must not convert otherwise valid Article output into a `503`.

The PHP integration stores digest state inside the existing complete synchronized Profile LKG under the existing state root. It MUST NOT create a parallel digest cache, second synchronization file, or visitor-time upstream read.

The upgraded PHP integration validates optional digest data independently from required Profile/Publication/Article state. If required Article candidate state is valid while digest data is malformed/inconsistent, the Article snapshot activates normally and the local digest normalizes to `null`. PHP MUST NOT preserve an older Article LKG or make ordinary feed rendering unavailable solely because optional digest data is invalid.

All pages in one candidate revision must carry the same normalized digest. Contradictory digest values across pages are invalid AI state for that candidate and must not be silently resolved by choosing one page; Article traversal/activation may still succeed with the digest degraded to `null` when required Article state remains coherent.

A pre-digest local snapshot remains a valid upgrade starting point and reads as `digest = null` until a later synchronized snapshot contains a valid digest.

`LocalProfileReader` exposes normalized first-class digest values alongside Profile/Publication/Article data. The normalized local digest carries `generatedAt`, `freshness`, `inputArticleCount`, provider, model, overview, highlights, and supporting Articles. Supporting Articles expose at minimum `articleId`, headline, Source display name, `effectiveFeedDate`, and exact stored `originalUrl`.

Existing `LocalReadResult::$staleAgeSeconds` continues to describe the synchronized local Profile/LKG state; it MUST NOT be redefined as AI-content age. Digest age derives from `digest.generatedAt`, while semantic current/older state comes from `digest.freshness`.

Ordinary visitor rendering remains local-only and does not call Gemini or News Scraper merely to display the synchronized digest.

## Customer presentation and package handoff

The supported customer-facing presentation boundary is normalized `LocalProfileReader` / `LocalReadResult` data. News Scraper/integration code owns synchronization, LKG persistence, validation, normalization, and safe data exposure. The customer owns final HTML, CSS/classes, layout, placement, and site-specific presentation.

Phase 1 does not create an authoritative digest renderer or customer-facing CSS system. A minimal instructional/example snippet may demonstrate safe server-side access to normalized Article and digest values, but such markup is non-authoritative.

When `digest === null`, the default integration behavior is simply no digest data to render; public provider failure text is not injected automatically. Customer templates may use `current` versus `older` to label the digest honestly while preserving the truthful `generatedAt` value.

The completed Phase 1 worksheet also defines the intended production package upgrade: version-matched whole-folder replacement of `ns-integration` while preserving sibling `ns-private`, stable packaged `run-sync.php`, version metadata, `UPGRADE.md`, no new customer Gemini key/credential/database/cron, and directory-level rollback. The active roadmap deliberately assigns the actual corrected package refresh and production customer deployment to Phase 2 / `2.2.x`; Phase 1 must produce a compatible digest-capable v1/PHP/local-read boundary without pulling that production deployment forward.

## Interactive "Ask this feed" chat

Interactive chat answers questions about one Distribution Profile using that Profile's governed Articles as its primary factual context.

The generic behavior is "Ask this feed," not "indie publishing chatbot." Profile identity/configuration determines the available corpus; no shared code prompt may assume publishing, filmmaking, opportunities, or another specific subject.

### Grounding

Each chat request must be grounded in a bounded current Profile context selected through canonical Profile semantics. Initial 3.0 scope SHOULD prefer the smallest architecture that works with the Profile's bounded recent Article set rather than introducing embeddings/vector infrastructure prematurely.

When provider URL Context is enabled for chat, the same URL-selection rule applies: only bounded exact stored `originalUrl` values from the current governed Profile context may be supplied. User questions, prior conversation text, retrieved content, and model output cannot add arbitrary destinations or activate general web search.

If semantic retrieval/embeddings are added later, retrieval must remain downstream of canonical Profile eligibility and must never become a route around Source trust, moderation, duplicate suppression, or Profile membership.

Conversation history is untrusted input and MUST be bounded by count/size/time or equivalent policy before sending it to the model.

### Answer support and citations

The model SHOULD answer from the supplied Profile context and identify when the feed does not provide enough support for a confident answer.

Article citations/references returned to clients must be validated against the actual Profile context. The model may return Article IDs or other bounded reference keys, but application code owns resolution to canonical headline/Source/`originalUrl` data.

The system MUST NOT trust model-generated URLs as Article destinations. Visible citation links use exact stored `originalUrl` values from governed Article data.

The implementation SHOULD expose whether an answer is supported by the current feed and which Articles support it. It must not present invented feed facts or invented citations as validated News Scraper records.

## Chat transport and authorization

Gemini credentials/API keys remain server-side and outside source control, public HTML, JavaScript bundles, PHP public document roots, query strings, logs, and cache payloads.

Browser code MUST NOT receive a Gemini API key.

An interactive customer-site flow may use a customer server endpoint that calls a governed News Scraper AI endpoint/server service. Unlike ordinary feed rendering, an explicit user chat action is allowed to make a live upstream request.

Billable/abuse-sensitive AI authority must be separately governed. Existing `distribution:read` capability alone MUST NOT silently become authorization for unlimited interactive AI spending. Roadmap Phase 3 must define and implement an explicit AI authorization/capability boundary, rate limiting, request-size bounds, and abuse/cost controls while preserving strict separation from administrator authority.

The exact endpoint path and credential representation are Phase 3 interface-design work; this contract does not pre-authorize an incompatible change to `/api/v1/distribution/...`.

## Security, privacy, and logging

AI secrets and customer request content follow the existing secret/redaction rules plus these requirements:

- never log Gemini keys, Authorization headers, machine token plaintext, or secret environment values;
- do not log unbounded prompts, Article corpora, retrieved publisher-page content, full chat histories, or full model responses by default;
- operational telemetry may record bounded Profile key, model/provider, duration, token/usage facts when safely available, result/failure category, bounded URL-retrieval status facts, and non-secret request correlation identifiers;
- do not send private administrator configuration, credentials, internal database fields, Collection-run bodies, unrelated Profiles, or arbitrary URLs to Gemini merely because they exist in the instance or appear in Source/user/model text;
- send only the minimum bounded Profile/article/user context and exact application-selected governed URLs required for the requested AI capability;
- customer/operator documentation must identify that the feature sends bounded content/user prompts and, when URL Context is enabled, governed publisher Article URLs to the configured external AI provider.

Provider data-handling/retention claims must not be invented by News Scraper documentation; deployment operators remain responsible for provider terms/configuration appropriate to their use.

## AI output presentation

AI-generated content must be distinguishable from publisher-supplied Article metadata and ordinary editorial configuration. Supported first-party/integration examples SHOULD label digest/chat content as AI-generated or otherwise make its origin clear.

AI text is untrusted output for rendering and MUST be escaped/sanitized for its output context. Model markdown/HTML must not be rendered as trusted executable markup unless a separately governed safe renderer is implemented.

AI output does not replace Article headlines, Source attribution, dates, summaries, Categories, or original publisher links in persistence.

## Topic independence

The shared AI layer is topic agnostic.

Allowed configuration includes Profile selection, generic system instructions describing the role as a feed summarizer/assistant, bounded formatting/tone options if later governed, provider/model configuration, cadence, and operational limits.

The shared implementation MUST NOT contain logic such as:

- special handling for indie authors;
- special filmmaking keywords;
- hard-coded opportunity categories;
- subject-specific answer policy tied to one customer deployment.

Subject relevance comes from the configured Sources/Relevance/Categories/Profile and the Articles actually supplied as context.

## Self-hostability and provider dependency

Gemini is an optional AI feature dependency, not a mandatory dependency for ordinary News Scraper collection, administration, persistence, moderation, canonical distribution, PHP Article LKG, or non-AI rendering.

Disabling or failing AI must leave the non-AI product independently operable, preserving Project Contract Law 12. A future self-hosted deployment may configure the supported AI provider or disable AI without requiring a central News Scraper cloud AI service.

## Validation requirements

Implementation evidence must cover the narrowest applicable levels from `testing-and-validation-contract.md`, including at minimum:

- deterministic 7-day/default and 1–20 Article input bounding, canonical ordering, zero/one/many cardinality behavior, and Profile grounding;
- deterministic `digestInputIdentity`, unchanged-input skip behavior, configuration-change reevaluation, and manual force generation;
- exact governed URL selection for URL Context and rejection of arbitrary/model/user/Source-selected destinations;
- graceful bounded fallback when URL Context cannot retrieve an Article page;
- prompt-injection treatment of Source/user/retrieved-page content as untrusted data;
- structured-output/schema/text/reference bounds and rejection of unknown/out-of-input support IDs;
- provider timeout/error/rate-limit failure isolation;
- immutable digest persistence, atomic active-digest replacement, separate attempt state, and canonical-invalidation suppression;
- `current | older | null` lifecycle semantics including overlap and no age-only stale cutoff;
- v1 digest participation in snapshotRevision/ETag and consistent digest across continuation pages;
- PHP fail-open digest validation, pre-digest upgrade compatibility, normalized local-read shape, and no AI call on ordinary visitor rendering;
- Profile AI admin configuration/status/manual-generation controls without secret exposure;
- citation/support validation and exact `originalUrl` resolution;
- secret/log redaction;
- multi-Profile topic independence using materially different Profile subjects; and
- an executed Gemini integration proof using non-production/safely provisioned credentials before claiming the provider integration works.

Mocks may prove orchestration but do not prove live Gemini/provider behavior or live URL Context retrieval. Live-provider evidence must be clearly distinguished from deterministic local tests and executed only in the environment assigned by the testing contract's necessity/environment matrix.

Chat-specific authentication/rate/request/cost evidence belongs to the later chat phase, not Phase 1 digest completion.

## Out of initial scope

Unless later promoted, the initial 3.0 AI work does not require:

- autonomous Source discovery or approval;
- AI-written Relevance/Profile rules;
- AI moderation or duplicate decisions;
- a News Scraper-owned Article-body crawler or persisted Article-body RAG corpus;
- arbitrary web browsing/search or model-selected URL retrieval beyond application-selected governed `originalUrl` URL Context;
- embeddings/vector databases when bounded Profile context is sufficient;
- autonomous tool use over the admin control plane;
- personalized reader profiling;
- visitor tracking/advertising inference;
- AI-generated replacement headlines or publisher summaries persisted as Source metadata.
