# Phase 1 Gemini Live Qualification

**Status:** IN PROGRESS - LIVE PROVIDER PROOF GREEN / INTEGRATED DB PROOF PENDING  
**Qualification date:** 2026-08-29  
**Package candidate:** `2.1.7`  
**Exact VPS qualification candidate:** `05f091980bf8bb0ec70749e94b9fe5b3c53f0edd`  
**Model correction commit:** `fd777c42e5c4676e268708900afb0883fb5e265e` (`c1-gemini-model`)  
**Human review:** Required

## Purpose

This artifact continues the blocked Phase 1 closeout recorded in `docs/validation/phase-1-gemini-profile-digest-foundation.md`.

The prior closeout completed the deterministic Phase 1 review but could not close because live Gemini/provider and integrated application evidence were missing. This qualification records the owner-run VPS evidence used to clear that remaining gate. It does not rewrite the earlier blocked artifact or claim Phase 1 GREEN before the real database-backed lifecycle proof is complete.

## Exact candidate and model correction

The VPS deployment reports exact SHA:

`05f091980bf8bb0ec70749e94b9fe5b3c53f0edd`

Repository history confirms that candidate contains `fd777c42e5c4676e268708900afb0883fb5e265e` (`c1-gemini-model`). The correction changes the production Gemini digest default from `gemini-3.7-flash` to `gemini-3.6-flash`, preserves explicit `NEWS_SCRAPER_GEMINI_MODEL` overrides, and leaves package version `2.1.7` unchanged.

The same candidate also contains the owner-approved AI contract, active-roadmap, and changelog alignment for `gemini-3.6-flash`.

## VPS provider isolation evidence

Environment:

- Linux VPS deployment under `/www/news-scraper`.
- Same Gemini API key/project for both control calls; secret value was not recorded.
- Gemini Developer API Interactions endpoint: `https://generativelanguage.googleapis.com/v1beta/interactions`.
- Minimal request shape used `store=false` and the same one-line prompt.

Observed direct REST controls:

- `gemini-3.7-flash` -> `HTTP=500`, total `7.204875s`.
- `gemini-3.6-flash` -> `HTTP=200`, total `3.303227s`.

Interpretation: VPS DNS/TCP/TLS reachability, Gemini API-key authorization, project access, and the Interactions endpoint are functional. The earlier 3.7 failure was isolated to the selected model/provider path rather than News Scraper networking or key authorization. The owner therefore approved `gemini-3.6-flash` as the Phase 1 production digest model.

## Live News Scraper provider proof

Governed test URL:

`https://www.thecreativepenn.com/2026/08/19/book-marketing-ai-book-discoverability-and-resilience-with-ricardo-fayet/`

The current `test/live-gemini/digest-provider-live.test.ts` exercises `createGeminiDigestProvider()` without setting `NEWS_SCRAPER_GEMINI_MODEL`, so the live suite proves the production default model rather than forcing a test-only model override.

The owner first reported the corrected VPS `npm run test:live-gemini` run succeeding on the exact deployed candidate using `NEWS_SCRAPER_GEMINI_API_KEY` and `NEWS_SCRAPER_GEMINI_TEST_URL`. A follow-up owner-run call through the same production `createGeminiDigestProvider()` boundary then printed the validated application candidate for inspection.

Observed validated result:

- result kind: `success`;
- provider: `google-gemini`;
- model: `gemini-3.6-flash`;
- overview length: 429 characters, below the 2,000-character hard bound;
- highlights: 3, at the allowed maximum;
- highlight title lengths: 40, 44, and 39 characters, all below the 200-character bound;
- highlight explanation lengths: 327, 284, and 279 characters, all below the 500-character bound;
- every highlight supported only `live-proof-article`, the sole Article ID present in the governed input;
- total generated overview/title/explanation text: 1,442 characters, below the approximately 4,000-character aggregate bound;
- bounded provider usage fact: `totalTokens = 14281`;
- URL Context: 1 success, 0 errors, 0 paywalls, 0 unsafe results, 0 unknown results.

The generated content materially reflected the supplied Creative Penn article, while the supplied fallback summary contained only a generic safe-reference sentence. Together with `urlContext.successCount = 1`, this is direct evidence that the governed URL Context retrieval contributed usable publisher-page context. No model-generated URL was accepted as an outward destination; support remained the application-supplied `live-proof-article` identity.

No API key, raw SDK/provider response, retrieved publisher-page body, unbounded prompt, or secret value is recorded in this artifact. The captured content was the already validated and bounded News Scraper candidate boundary.

The observed `totalTokens = 14281` for a one-Article proof is notable operational evidence for later cost/usage tuning, but it does not violate a Phase 1 correctness bound and does not alter the present acceptance criteria.

## Real VPS PostgreSQL preflight

The owner then inspected the exact deployed candidate before any AI configuration mutation.

Observed:

- `git rev-parse HEAD` -> `05f091980bf8bb0ec70749e94b9fe5b3c53f0edd`;
- `npm run db:status` -> `{"state":"current"}`;
- one managed Distribution Profile exists: `php_integration_test` / `PHP Integration Test`;
- Profile lifecycle: `active`;
- associated Sources: 5;
- AI configuration before qualification mutation: `digestEnabled=false`, `lookbackDays=7`, `maxArticles=20`;
- active digest before qualification: `null`;
- latest persisted attempt before qualification: scheduled `skipped_disabled`, started `2026-08-29T15:07:32.613Z`, completed `2026-08-29T15:07:32.643Z`, no failure category, and zero URL Context success/failure counts.

This preflight proves the production schema is current and gives a clean baseline for the integrated lifecycle proof: an active real Profile exists, AI is disabled by default, no prior active digest can be mistaken for the qualification result, and the scheduler has already persisted the disabled-path outcome without invoking Gemini.

## Real canonical digest input proof

The owner then called the production `createDigestInputService()` against `php_integration_test` with the real VPS PostgreSQL state and current clock. This was a read-only canonical-input inspection before enabling AI.

Observed bounded input:

- Profile: `php_integration_test` / `PHP Integration Test`;
- settings at read time: `digestEnabled=false`, lookback 7 days, max 20 Articles;
- deterministic `digestInputIdentity`: `f7e8a8d87bcf5dbcbc906d6880a462975b21f60f3366a1876201316f2fc4c783`;
- qualifying Article count: 10;
- all 10 Articles had persisted summaries available;
- newest qualifying `effectiveFeedDate`: `2026-08-27T10:15:37.000Z`;
- oldest qualifying `effectiveFeedDate`: `2026-08-24T10:45:00.000Z`;
- the input spans the Profile's real canonical content from Based Book Sale, Jane Friedman, Author Media, The Creative Penn, and The Episodic Podcast;
- exact stored `originalUrl` values were present for every Article and therefore available to the governed URL Context boundary.

The 10 observed headlines, in canonical order, were:

1. `Call for Authors: 2026 BasedCon Based Book Sale`;
2. `Why Top Literary Magazines Charge Writers Who Submit: Q&A with Benjamin Davis of Chill Subs`;
3. `Bindery Books launches a new fiction imprint`;
4. `Harper Collins launches manga imprint`;
5. `Insight Editions launches Naga Archives`;
6. `Will Your Back Matter Get Your Book Banned on Amazon?`;
7. `From Page One To Done: Fast Drafting Your Novel With Jessica Brody`;
8. `AI Read Aristotle That’s Why It Writes Better Than You`;
9. `When and How to Nudge Agents`;
10. `Writing, Publishing & Authorship : 8-11-26`.

The read emitted a `pg` deprecation warning about calling `client.query()` while a query was already executing. The command still returned the complete canonical result and no database or application error. This warning is recorded as incidental qualification evidence and does not by itself invalidate the canonical-input proof; if it recurs in the mutation/lifecycle proof or indicates an actual concurrency defect, it must be handled separately rather than ignored.

This proves the integrated generation will start from the existing canonical Profile snapshot producer and its bounded 7-day/max-20 projection rather than a test fixture, raw Article query, or AI-owned selector.

## Evidence still required before Phase 1 closeout

1. Enable the Profile digest through the supported administration service while preserving the existing 7-day / 20-Article bounds.
2. Execute one manual generation through the production digest lifecycle and real Gemini provider.
3. Prove a successful generation is durably persisted and activated, with `gemini-3.6-flash` recorded as the model and a bounded successful attempt state.
4. Re-read the active digest from a fresh process to prove durability rather than in-memory state.
5. Inspect the protected admin read model and permanent v1 distribution representation for the same active digest where practical, including exact governed supporting-Article destinations and digest participation in the outward snapshot.
6. Keep ordinary Article distribution and non-AI operation unaffected throughout qualification.

## Current disposition

**IN PROGRESS.** The live provider gate is GREEN; the exact VPS candidate/database baseline is current; and the real canonical digest input has been observed as 10 bounded, summary-bearing Profile Articles across five Sources. Phase 1 is not yet marked GREEN because the final integrated PostgreSQL generation/persistence/activation/readback proof remains to be executed and recorded.
