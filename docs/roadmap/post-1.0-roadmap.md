# Post-1.0 Roadmap

**Status:** PAUSED — owner-approved product-direction reset in progress.  
**Current package version:** `1.0.1`.  
**Current implementation phase:** none.  
**Last implemented roadmap work:** former Phase 0 / P1 — server-rendered root, shipped as `1.0.1`.  
**Next implementation version:** intentionally unassigned until a replacement roadmap is approved.  
**Primary direction:** headless news aggregation/distribution core with an administrator control plane and supported downstream consumers; bundled `/` remains a reference/standalone frontend.

## Current roadmap state

The MVP roadmap closed successfully into the supported `1.0.0` production baseline. Post-1.0 Phase 0 then began under the earlier frontend-centric roadmap.

Phase 0 P1 implemented server-rendered `GET /` at package version `1.0.1`. Before the planned Phase 0 closeout/P2 executed, the repository owner approved a product-direction change on 2026-08-19 after the original client identified integration into an existing website and cross-source outbound-link distribution as the primary use case.

The Platform is now governed by:

- `docs/contracts/project-contract.md`;
- `docs/contracts/product-scope-and-users.md`;
- `docs/decisions/headless-distribution-product-boundary.md`.

The former frontend-first post-1.0 sequence is therefore **retired as an implementation plan**. It is retained below only as planning history so the repository does not pretend those ideas were never considered.

No implementation prompt stack may be generated or executed from this file until the distribution-method and SEO architecture investigation is complete and an owner-approved replacement roadmap has been documented.

`1.0.2` is **not reserved or assigned** by the retired Phase 0 closeout. The next version must be derived from the replacement roadmap rather than inferred from the old sequence.

## Product-direction gate before implementation resumes

Before `/prompt-ass` resumes for roadmap implementation, complete this documentation/design sequence:

1. investigate viable distribution methods for existing websites/CMS consumers;
2. investigate SEO/backlink behavior and constraints for those methods;
3. decide the canonical external distribution boundary and adapter strategy;
4. decide any required security/authentication/CORS/rate-limit/cache compatibility boundary;
5. decide whether consumer-specific distribution profiles or exclude-self/source-sharing semantics are required;
6. update the governing contracts/ADRs through `/docs-review` → explicit approval → `/docs-apply`;
7. write and approve a replacement post-1.0 implementation roadmap;
8. only then resume `/prompt-ass` → `/prompt-plan` → `/prompt-write`.

The investigation must not assume that RSS, server-side JSON consumption, JavaScript widgets, iframes, CMS plugins, or another method is preferred before evidence is gathered. It also must not promise SEO value merely because a link is technically rendered somewhere.

## Preserved laws during the roadmap reset

The pause does not reopen the core Platform architecture.

The replacement roadmap must preserve unless separately amended through the explicit contract-change process:

- one Publication/topic per deployed installation;
- topic-independent shared engine behavior;
- administrator-approved Sources as the collection trust boundary;
- structured-feed-first collection;
- normalization before outward consumption;
- Source-scoped idempotent Article identity;
- Source/endpoint/run/Article/observation provenance;
- true-duplicate suppression without deleting Source instances;
- Article visibility independent from duplicate role;
- stored `original_url` as the reader destination;
- Source failure isolation;
- Worker-owned collection with no inline Web/API collection;
- supported production-data/migration compatibility from the accepted `1.0.0` production baseline;
- focused plus blast-radius regression evidence under the testing contract.

The existing `1.0.1` server-rendered reference frontend remains supported code. The pivot does not authorize deleting or weakening it merely because it is no longer the primary product identity.

## Runner/tooling state

The previously completed `c21-post-1-runner-compatibility` correction remains valid tooling work. The runner supports the approved post-1.0 task grammar (`p1-<phase>` and `1.<phase>.<prompt>`), but grammar support does not itself authorize a roadmap phase.

There is currently no executable post-1.0 roadmap stack authorized by this roadmap. The former unexecuted Phase 0 P2 closeout has been retired from the active task path and recorded as superseded planning history.

Correction stacks remain available only for independently owner-approved bounded regressions/repairs that genuinely qualify as corrections and preserve their declared package version. They must not be used to smuggle distribution-product development around the roadmap pause.

## Implemented post-1.0 history

### Former Phase 0 — Server-rendered public feed

**Original baseline:** `1.0.0`  
**Implemented:** P1 at `1.0.1`  
**Closeout:** interrupted before P2 by the owner-approved product-direction change  
**Current classification:** supported reference-frontend capability; no longer the active roadmap's product center

P1 established:

- server-rendered configured Publication presentation at `GET /`;
- first-page Article rows in initial HTML;
- direct stored `original_url` headline links;
- server-side first-page `q`/Source/Category discovery;
- bounded `200`/`400`/`404`/`503` HTML outcomes;
- JavaScript progressive enhancement rather than initial feed construction;
- reuse of the existing canonical public-feed dependency/read semantics rather than another Article SQL authority.

No schema/persisted-data redesign was introduced by that P1 work.

The planned Phase 0 P2 closeout would have advanced the package to `1.0.2`; it was intentionally not executed after the product pivot and no longer owns any future version.

## Retired frontend-centric planned sequence

The earlier roadmap planned the following work after SSR. These entries are **not active phases, do not reserve version numbers, and do not authorize implementation**. They are retained only to preserve planning context for the upcoming architecture review.

1. **Crawlable pagination and configurable public page size** — promote keyset continuation into no-JavaScript/crawlable navigation and let the operator configure bounded page size.
2. **SEO foundation** — titles, descriptions, canonical handling, robots, sitemap, indexing policy, and sharing metadata for the standalone public site.
3. **Public Article summaries** — expose safe Source-provided summaries through the public read model and server-rendered cards.
4. **Historical archive discovery** — stable year/month-style browseable history for the standalone site.
5. **Article thumbnails / Source-provided images** — governed optional image metadata and public presentation.
6. **Scale and performance validation** — realistic corpus/workload measurement and evidence-based optimization.

Some of these capabilities may remain useful after the distribution/SEO investigation, but they must be reclassified and resequenced according to the headless product boundary rather than carried forward automatically.

## Versioning rule while paused

`package.json` remains the sole current-version authority and is currently `1.0.1`.

Documentation work, product research, ADR work, roadmap replacement, and prompt planning do not change that value. No old Phase 0 P2/`1.0.2` transition may be executed after this pause.

When a replacement roadmap is approved, it must explicitly define the next phase identifier and semantic-version target before executable task prompts are written. Do not infer that target from the retired sequence.

## Historical roadmap authority

Use `docs/roadmap/mvp-roadmap.md` for the completed pre-1.0 Phase 0–21 implementation history and durable validation links. Historical task prompts and validation artifacts remain truthful evidence for the source trees they governed; this product pivot does not rewrite them.