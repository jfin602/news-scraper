# Phase 1 Gemini Live Qualification

**Status:** IN PROGRESS - LIVE PROVIDER EVIDENCE RECORDED / INTEGRATED DB PROOF PENDING  
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

The current `test/live-gemini/digest-provider-live.test.ts` exercises `createGeminiDigestProvider()` without setting `NEWS_SCRAPER_GEMINI_MODEL`, so the live suite now proves the production default model rather than forcing a test-only model override.

The owner reports a successful corrected-model VPS live-provider run on the exact deployed candidate using `NEWS_SCRAPER_GEMINI_API_KEY` and `NEWS_SCRAPER_GEMINI_TEST_URL`.

At this point the success is recorded as owner-observed evidence. The exact suite transcript and the validated candidate content have not yet been copied into this artifact. The next qualification step intentionally captures the validated digest output in bounded form before moving to the database-backed lifecycle proof.

## Evidence still required before Phase 1 closeout

1. Capture and inspect the live validated digest candidate from the production provider boundary, including provider/model, bounded overview/highlights/support IDs, URL Context retrieval facts, and bounded usage facts where available. Do not record the API key, raw provider response, retrieved page body, or unbounded prompt content.
2. Execute a real VPS PostgreSQL proof through the production digest lifecycle using an existing managed Distribution Profile and real canonical Article data.
3. Prove a successful generation is durably persisted and activated, with `gemini-3.6-flash` recorded as the model and a bounded successful attempt state.
4. Re-read the active digest from a fresh process to prove durability rather than in-memory state.
5. Inspect the protected admin read model and permanent v1 distribution representation for the same active digest where practical, including exact governed supporting-Article destinations and digest participation in the outward snapshot.
6. Keep ordinary Article distribution and non-AI operation unaffected throughout qualification.

## Current disposition

**IN PROGRESS.** The original live-provider blocker is materially reduced: real Gemini connectivity and `gemini-3.6-flash` availability have been demonstrated from the VPS, and the owner reports the corrected News Scraper live-provider suite succeeding on the deployed candidate. Phase 1 is not yet marked GREEN because the final integrated PostgreSQL persistence/activation/readback proof remains to be executed and recorded.
