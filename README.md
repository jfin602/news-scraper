# News Scraper

News Scraper is a reusable, topic-independent **headless news aggregation and distribution Platform**. It collects Article metadata from administrator-approved Sources, normalizes Source-specific input, persists Source instances idempotently with endpoint/run provenance, groups true duplicates without deleting their Source records, gives operators a protected editorial/control plane, and exposes governed normalized Article output for downstream consumers while preserving original publisher destinations.

Each deployed installation hosts exactly one singleton Publication representing one customer/editorial property and governed content universe. A Publication may contain multiple related subject verticals or feed sections, exposed through Distribution Profiles. Publishing news, opportunities, indie filmmaking, and future customer subjects remain configuration rather than shared-engine logic. Publication is singleton editorial configuration, not a relational tenancy key.

The current implemented outward surfaces are:

```text
GET /api/v1/distribution/{profile_key}  # permanent authenticated machine distribution API
GET /api/feed                            # legacy/reference JSON feed/output surface
GET /                                    # bundled reference/standalone public frontend
```

All three reuse the governed canonical outward Article-selection authority; the v1 route applies Profile selection after canonical eligibility. The bundled frontend remains supported, but it is not the product's primary architectural identity; client websites may consume supported distribution output while owning their own presentation.

## Current state

The accepted `1.0.0` customer launch established the first supported production source/version/schema baseline. Post-1.0 server-rendering work then shipped at package version `1.0.1`.

On 2026-08-19 the repository owner approved the headless aggregation/distribution product direction. On 2026-08-20 the owner locked the managed-first/self-hostable macro architecture, Distribution Profiles, machine distribution API, generic PHP/LKG integration direction, and customer presentation freedom.

The seven-phase 2.0 roadmap is complete. Package `2.0.0` is the current release baseline, and the real customer PHP package is integrated into the customer's existing site. The permanent Profile API, generic PHP complete-snapshot synchronization/LKG, normalized local-read boundary, and customer server-rendered integration remain the foundation for later work.

On 2026-08-27 the owner amended the singleton Publication model so one Publication represents one customer/editorial property rather than necessarily one narrow topic. The same customer installation may therefore expose materially different feeds—currently planned as publishing news, opportunities, and indie filmmaking—through Distribution Profiles without introducing multi-Publication tenancy.

The owner-approved 3.0 roadmap is **pre-activation** at package `2.0.0`. Its immediate goals are Profile-grounded Gemini digests, an "Ask this feed" Gemini chatbot, real multiple-feed customer proof, and then admin/PHP integration tightening based on observed deployment friction. Before the roadmap can activate to `2.1.0`, the existing phase runner must receive a bounded unchanged-`2.0.0` compatibility correction so it can safely support the intended `2.x` development family without breaking historical task grammar.

Current product authority is:

- `docs/contracts/project-contract.md`;
- `docs/contracts/product-scope-and-users.md`;
- `docs/contracts/domain-and-data-contract.md`;
- `docs/contracts/distribution-and-integration-contract.md`;
- `docs/contracts/distribution-api-contract.md`;
- `docs/contracts/ai-assistance-contract.md` for owner-approved 3.0 AI behavior;
- `docs/decisions/single-publication-multi-vertical-editorial-property.md`;
- `docs/decisions/headless-distribution-product-boundary.md`;
- `docs/decisions/managed-first-self-hostable-distribution-architecture.md`;
- `docs/roadmap/3.0-roadmap.md` for current post-2.0 sequencing.

The completed 2.0 roadmap remains at `docs/roadmap/post-1.0-roadmap.md`. Detailed historical validation remains evidence only for the exact source tree and environment recorded.

## Architecture

```text
isolated News Scraper instance
  one singleton customer/editorial Publication
  Web/Admin + Worker + PostgreSQL + scheduler/jobs + config/secrets + interfaces
                              |
instance-owned control plane
  Sources/endpoints + filters + Categories/Relevance + moderation/duplicates + health
                              |
Distribution Profiles
  independent feed/section views after canonical eligibility
                              |
authenticated v1 distribution API
                              |
generic PHP scheduled sync → independent validated local LKG per Profile
                              |
customer server-rendered website
                              |
       approval + state + lock + network safety
                              |
              endpoint-selected parser adapter
                 /                         \
            RSS/Atom                  static HTML
                 \                         /
        normalization → link policy → Relevance
                              |
           Source-scoped identity + provenance
                              |
            duplicate review/grouping/moderation
```

Web/API serves normalized admin/outward read models and never collects Sources inline. Worker collection validates approval, lifecycle/operational state, and every request/redirect before contact. RSS/Atom and bounded static-HTML adapters produce the same Raw-item contract; the optional Source RSS/Atom admission filter applies only to RSS/Atom before normalization. All accepted candidates share normalization, Article-link policy, Relevance/Category, Source-scoped identity, persistence, observation, duplicate, and run-accounting boundaries.

The reader destination is stored Article `original_url`; canonicalized URLs remain identity fields. Article identity answers whether one Source instance was already stored, while duplicate grouping relates separately retained Articles across Sources. Collection trust and consumer-specific distribution selection are separate concerns.

The implemented distribution path is canonical eligibility → administrator-owned Profile → authenticated v1 API → scheduled generic PHP complete-snapshot synchronization → local last-known-good data → customer server-rendered output.

The planned AI path remains downstream of that Profile authority. Scheduled digests may be synchronized into local customer state; ordinary visitor feed rendering must not call Gemini. Explicit interactive chat may make a live server-side request but must use the separately governed AI authorization/rate/cost boundary and never expose the Gemini key to browser code.

See `docs/architecture/system-architecture.md` and the contracts/ADRs for authoritative detail.

## Local setup and validation

The project intentionally has no npm package lock. Repository npm configuration disables `package-lock.json` generation, so install with:

```text
npm install
```

A root `.env` is optional, local, ignored configuration and must not be committed. Explicit environment variables take precedence. Database-backed commands load `.env`; ordinary `npm test`, unit, integration, and `check` commands do not.

For a development database, set `NEWS_SCRAPER_DATABASE_URL` and apply migrations explicitly:

```text
npm run db:migrate
npm run db:bootstrap
```

Web/API and Worker startup never apply migrations automatically:

```text
npm run start:web
npm run start:worker
```

For database validation, set `NEWS_SCRAPER_TEST_DATABASE_ADMIN_URL` to a dedicated non-production PostgreSQL administrative connection and run `npm run test:db`. The role must be able to create disposable databases and terminate their ordinary leaked connections (for example, `CREATEDB` plus `pg_signal_backend`); `SUPERUSER` is neither required nor recommended. Never point this variable at development or production application data.

The testing authority is `docs/contracts/testing-and-validation-contract.md`. Evidence applies only to the exact tree and environment actually tested; source inspection is not runtime, browser, database, deployment, live-Source, or live-Gemini proof.

## Documentation

Start every repository-aware session with `BOOT.md`, which routes to the narrowest authority. `AGENTS.md` contains agent-specific workflow and safety rails; `docs/README.md` is the documentation index.

- `docs/contracts/project-contract.md` — locked laws, authority, and product boundaries.
- `docs/contracts/product-scope-and-users.md` — current post-2.0 product scope and user roles.
- `docs/contracts/mvp-scope-and-users.md` — historical `1.0.0` MVP scope only.
- `docs/contracts/domain-and-data-contract.md` — terminology, state, identity, provenance, and persistence semantics.
- `docs/contracts/source-and-collection-contract.md` — Source trust, network safety, adapters, pipeline, and run accounting.
- `docs/contracts/article-lifecycle-and-deduplication.md` — visibility, duplicate review/groups, and Primary behavior.
- `docs/contracts/public-feed-and-admin-contract.md` — current `/` reference-frontend and `/api/feed` behavior plus admin UX; product-surface interpretation is narrowed by the headless-distribution ADR and Publication scope by the 2026-08-27 multi-vertical ADR.
- `docs/contracts/distribution-and-integration-contract.md` — Distribution Profiles, PHP/LKG behavior, adapter/presentation/link boundaries, multi-Profile integration, and telemetry.
- `integrations/php/README.md` — implemented PHP synchronization/LKG, normalized local-read, and customer-integration package.
- `docs/contracts/distribution-api-contract.md` — permanent v1 Profile API, schema, snapshot/cursor behavior, machine credentials, errors, limits, and CORS stance.
- `docs/contracts/ai-assistance-contract.md` — owner-approved 3.0 Gemini digest/chat grounding, security, failure-isolation, citation, and topic-independence contract.
- `docs/contracts/testing-and-validation-contract.md` — regression and evidence requirements.
- `docs/architecture/system-architecture.md` — process, module, pipeline, scheduling, transaction, and distribution ownership for the implemented system.
- `docs/operations/` — onboarding, security/reliability, backup/restore, deployment, rollback, and incidents.
- `docs/roadmap/mvp-roadmap.md` — completed MVP phase history and exit gates through the `1.0.0` release.
- `docs/roadmap/post-1.0-roadmap.md` — completed historical seven-phase 2.0 roadmap and version lifecycle.
- `docs/roadmap/3.0-roadmap.md` — owner-approved pre-activation post-2.0 roadmap.
- `docs/roadmap/2.0-planning-questions.md` — completed non-normative planning record that led to the governing 2.0 contracts.
- `docs/decisions/single-publication-multi-vertical-editorial-property.md` — Accepted current interpretation of singleton Publication scope.
- `docs/decisions/headless-distribution-product-boundary.md` — Accepted headless product/output boundary decision.
- `docs/decisions/managed-first-self-hostable-distribution-architecture.md` — Accepted managed/self-hostable instance and integration architecture.
- `docs/decisions/` — other Accepted and superseded architectural decisions.
- `docs/design/` — presentation guidance and the isolated `ui-polish` workflow for the bundled/reference frontend.

The supported production-data boundary is governed by `docs/decisions/production-data-and-schema-compatibility.md`: clean migration from zero remains required for new/disposable installations, but it does not replace supported Phase 20-baseline upgrade and data-preservation proof.

## Repository

`jfin602/news-scraper` — default branch `main`.
