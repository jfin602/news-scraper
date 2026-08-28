# AI Assistance Contract

**Status:** Owner-approved 3.0 product contract; implementation not yet activated  
**Adopted:** 2026-08-27  
**Initial provider requirement:** Google Gemini  
**Roadmap:** `docs/roadmap/3.0-roadmap.md`

## Purpose and authority

News Scraper may use generative AI to help readers understand and interrogate the Articles already selected by a governed Distribution Profile. AI is a downstream assistance layer over canonical Profile output. It is never a Source, collector, trust authority, Relevance engine, Category authority, duplicate authority, Article-identity mechanism, ordering authority, or replacement for the persisted Article/provenance model.

The initial 3.0 implementation uses Google Gemini to satisfy the immediate product/hackathon requirement. Provider-specific request/response handling MAY live behind a narrow provider boundary, but subject/editorial behavior remains provider-independent and topic independent.

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

Initial grounding uses bounded safe normalized outward metadata needed for the feature, such as Article identifier, headline, Source, effective date, author, bounded summary, Categories, and exact stored `originalUrl`. For configured Gemini URL Context, application code MAY additionally provide a bounded subset of those exact stored `originalUrl` values so the provider can retrieve the corresponding public publisher pages. The URL set is derived only from the already-selected governed Profile Articles; arbitrary or model-selected destinations are prohibited.

The normalized Article summary remains part of the supplied context when present even when URL Context is attempted. This provides bounded fallback material when a publisher page is paywalled, unavailable, unsupported, or otherwise not successfully retrieved. URL retrieval failure for one Article is a context-degradation condition rather than an automatic digest failure; the model must not be instructed or allowed to imply that inaccessible content was successfully read.

Open issue `N6WD` has an owner-approved target invariant: persisted normalized `Article.summary` is bounded to 4,000 characters after plain-text normalization, with deterministic word-boundary truncation and `...` when needed. Until that behavior is implemented and validated, Phase 1 must either implement N6WD or otherwise prove that oversized existing summaries cannot enter unbounded Gemini prompts.

## Untrusted content and prompt injection

All Source-derived Article text and all publisher-page content retrieved through provider URL Context are untrusted data.

AI orchestration MUST clearly separate system/developer instructions from Article content and user content. Source titles, summaries, category labels, authors, retrieved page text, and other feed/provider-retrieved text MUST be treated as quoted/reference data, never executable instructions. A Source item or retrieved page that contains text such as "ignore previous instructions" must have no authority over model policy, tool selection, secrets, Profile selection, URL selection, or system behavior.

The implementation SHOULD use structured delimiters/typed request construction and the provider's structured-output facilities where practical. Model output must be validated before persistence or response use.

## Scheduled Profile digest

A Profile digest summarizes the recent developments represented by one Profile's current governed Article set.

Digest generation is server-side scheduled work. It MUST NOT run synchronously on an ordinary customer page request, ordinary PHP local-read request, or normal visitor rendering path.

The schedule is operator/configuration controlled. The initial product intent is approximately once or twice per day; the exact default/cadence bound may be locked during Phase 1 implementation planning. Repeated runs must be safe and must not create uncontrolled duplicate active digest state.

A stored/served digest must carry enough provenance to make its scope and freshness inspectable, including at minimum:

- Profile identity;
- generation timestamp;
- the Profile/snapshot revision or equivalent canonical input identity used;
- bounded input Article count;
- model/provider identity sufficient for operational diagnostics;
- AI-generated summary text;
- optional bounded highlights/themes;
- validated references to supporting Article IDs when the output claims article-specific support.

The exact persistence schema is implementation work, but active digest replacement must be atomic/transactionally coherent enough that consumers never observe a partially written structured result.

### Digest failure behavior

Gemini/provider failure, timeout, invalid structured output, safety rejection, rate limit, or dependency outage MUST NOT interrupt Source collection, Article persistence, canonical distribution, v1 Article output, PHP Article synchronization/LKG, or ordinary customer Article rendering.

Individual URL Context retrieval failures, including unavailable or paywalled publisher pages, do not by themselves invalidate a digest attempt when bounded normalized metadata/summary context remains sufficient. Retrieval status and provider failure handling must remain truthful and bounded; no successful retrieval may be fabricated.

A failed digest attempt may preserve the previous valid digest with truthful generation/freshness metadata. If no valid digest exists, consumers receive an explicit absent/unavailable AI state while Articles remain fully usable. The system must never fabricate a successful fresh digest merely because generation failed.

AI failure telemetry must be bounded and secret-safe.

## Distribution and PHP propagation

AI digest data is additive to the Article distribution product.

The permanent `/api/v1` contract permits compatible additive response fields. A 3.0 implementation MAY add a nullable/optional structured Profile digest to the v1 response when it can do so compatibly. Existing required v1 Article fields and semantics must remain unchanged.

If distributed through the v1/PHP path:

- PHP synchronization validates the digest shape together with the complete candidate snapshot;
- invalid AI metadata must not corrupt or replace otherwise valid Article LKG state;
- local-read exposes a normalized AI digest boundary rather than requiring customer code to parse cache internals;
- customer SSR may render the digest without JavaScript;
- visitor rendering remains local-only and does not call Gemini or News Scraper merely to display the most recently synchronized digest;
- digest age/generation time remains available so presentation can label stale/older AI output honestly.

A later implementation may choose an independently refreshable AI payload only if it preserves the same atomicity, local-read, and failure-isolation guarantees and does not create competing Article-selection semantics.

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

Billable/abuse-sensitive AI authority must be separately governed. Existing `distribution:read` capability alone MUST NOT silently become authorization for unlimited interactive AI spending. Phase 2 must define and implement an explicit AI authorization/capability boundary, rate limiting, request-size bounds, and abuse/cost controls while preserving strict separation from administrator authority.

The exact endpoint path and credential representation are Phase 2 interface-design work; this contract does not pre-authorize an incompatible change to `/api/v1/distribution/...`.

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

- deterministic input bounding and Profile grounding;
- exact governed URL selection for URL Context and rejection of arbitrary/model/user/Source-selected destinations;
- graceful bounded fallback when URL Context cannot retrieve an Article page;
- prompt-injection treatment of Source/user/retrieved-page content as untrusted data;
- structured-output/schema rejection;
- provider timeout/error/rate-limit failure isolation;
- atomic/preserved prior digest behavior;
- no AI call on ordinary visitor feed rendering;
- additive API/PHP/local-read compatibility when digest propagation is implemented;
- citation validation and exact `originalUrl` resolution;
- chat auth/rate/request bounds and machine/admin separation;
- secret/log redaction;
- multi-Profile topic independence using materially different Profile subjects;
- an executed Gemini integration proof using non-production/safely provisioned credentials before claiming the provider integration works.

Mocks may prove orchestration but do not prove live Gemini/provider behavior or live URL Context retrieval. Live-provider evidence must be clearly distinguished from deterministic local tests.

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
