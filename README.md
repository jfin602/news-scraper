# News Scraper

News Scraper is a reusable, topic-independent **headless news aggregation and distribution Platform**. It collects Article metadata from administrator-approved Sources, normalizes Source-specific input, persists Source instances idempotently with endpoint/run provenance, groups true duplicates without deleting their Source records, gives operators a protected editorial/control plane, and exposes governed normalized Article output for downstream consumers while preserving original publisher destinations.

Each deployed installation hosts exactly one Publication/topic. The first deployment covers publishing-industry news relevant to indie authors; its Sources, Categories, Relevance rules, branding, and later distribution configuration are configuration, not shared-engine logic. Another topic uses another configured deployment of the same codebase. Publication is singleton editorial configuration, not a relational tenancy key.

The current implemented outward surfaces are:

```text
GET /api/feed  # current JSON feed/output surface
GET /          # bundled reference/standalone public frontend
```

Both currently consume the same canonical outward/public Article-selection semantics. The bundled frontend remains supported, but it is no longer the product's primary architectural identity; future client websites may consume supported distribution output while owning their own presentation.

## Current state

The accepted `1.0.0` customer launch established the first supported production source/version/schema baseline. Post-1.0 server-rendering work then shipped at package version `1.0.1`.

On 2026-08-19 the repository owner approved a product-direction shift toward the headless aggregation/distribution core. On 2026-08-20 the owner locked the managed-first/self-hostable macro architecture, Distribution Profiles, machine distribution API, generic PHP/LKG integration direction, and customer presentation freedom.

The replacement 2.0 implementation roadmap is now active. Phase 1 implemented the Distribution Profile foundation; Phase 2 implemented the transport-independent canonical/Profile distribution read model; and Phase 3 implemented dedicated machine credentials and distribution-security foundations. The current `1.4.0` baseline begins Phase 4, the versioned v1 distribution API. PHP/LKG and customer integration remain future phases. Development remains in the `1.x.x` series through seven roadmap phases; after the final Phase 7 managed-integration release gate is green, terminal closeout promotes the final validated `1.7.x` candidate directly to `2.0.0`.

Linux VPS/Docker Compose self-host packaging, native self-host admin authentication, WordPress, and RSS/Atom remain post-2.0 work. Self-hostability remains an architectural requirement, but packaging no longer blocks the managed 2.0 product validation.

Current product authority is:

- `docs/contracts/project-contract.md`;
- `docs/contracts/product-scope-and-users.md`;
- `docs/contracts/distribution-and-integration-contract.md`;
- `docs/contracts/distribution-api-contract.md`;
- `docs/decisions/headless-distribution-product-boundary.md`;
- `docs/decisions/managed-first-self-hostable-distribution-architecture.md`;
- `docs/roadmap/post-1.0-roadmap.md`.

Detailed MVP history, including the qualified Phase 9 and Phase 14 owner acceptances, remains in `docs/roadmap/mvp-roadmap.md` and `docs/validation/`. Historical validation remains evidence only for the exact source tree and environment recorded.

## Architecture

```text
isolated News Scraper instance
  Web/Admin + Worker + PostgreSQL + scheduler/jobs + config/secrets + interfaces
                              |
instance-owned control plane
  Sources/endpoints + filters + Categories/Relevance + moderation/duplicates + health
                              |
Distribution Profiles (post-canonical-eligibility narrowing)
                              |
authenticated v1 distribution API
                              |
generic PHP scheduled sync → validated local LKG
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

The active 2.0 path is canonical eligibility → administrator-owned Profile → authenticated v1 API → scheduled generic PHP complete-snapshot synchronization → local last-known-good data → customer server-rendered output. WordPress, RSS/Atom, self-host packaging, and native self-host admin authentication are post-2.0.

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

The testing authority is `docs/contracts/testing-and-validation-contract.md`. Evidence applies only to the exact tree and environment actually tested; source inspection is not runtime, browser, database, deployment, or live-Source proof.

## Documentation

Start every repository-aware session with `BOOT.md`, which routes to the narrowest authority. `AGENTS.md` contains agent-specific workflow and safety rails; `docs/README.md` is the documentation index.

- `docs/contracts/project-contract.md` — locked laws, authority, and product boundaries.
- `docs/contracts/product-scope-and-users.md` — current post-1.0 headless product scope and user roles.
- `docs/contracts/mvp-scope-and-users.md` — historical `1.0.0` MVP scope only.
- `docs/contracts/domain-and-data-contract.md` — terminology, state, identity, provenance, and persistence semantics.
- `docs/contracts/source-and-collection-contract.md` — Source trust, network safety, adapters, pipeline, and run accounting.
- `docs/contracts/article-lifecycle-and-deduplication.md` — visibility, duplicate review/groups, and Primary behavior.
- `docs/contracts/public-feed-and-admin-contract.md` — current `/` reference-frontend and `/api/feed` behavior plus admin UX; its product-surface interpretation is narrowed by the headless-distribution ADR.
- `docs/contracts/distribution-and-integration-contract.md` — Distribution Profiles, PHP/LKG behavior, adapter/presentation/link boundaries, later adapters, and telemetry.
- `docs/contracts/distribution-api-contract.md` — permanent v1 Profile API, schema, snapshot/cursor behavior, machine credentials, errors, limits, and CORS stance.
- `docs/contracts/testing-and-validation-contract.md` — regression and evidence requirements.
- `docs/architecture/system-architecture.md` — process, module, pipeline, scheduling, and transaction ownership for the implemented system.
- `docs/operations/` — onboarding, security/reliability, backup/restore, deployment, rollback, and incidents.
- `docs/roadmap/mvp-roadmap.md` — completed MVP phase history and exit gates through the `1.0.0` release.
- `docs/roadmap/post-1.0-roadmap.md` — active seven-phase 2.0 implementation roadmap and version lifecycle.
- `docs/roadmap/2.0-planning-questions.md` — completed non-normative planning record that led to the governing 2.0 contracts.
- `docs/decisions/headless-distribution-product-boundary.md` — Accepted headless product/output boundary decision.
- `docs/decisions/managed-first-self-hostable-distribution-architecture.md` — Accepted managed/self-hostable instance and integration architecture.
- `docs/decisions/` — other Accepted and superseded architectural decisions.
- `docs/design/` — presentation guidance and the isolated `ui-polish` workflow for the bundled/reference frontend.

The supported production-data boundary is governed by `docs/decisions/production-data-and-schema-compatibility.md`: clean migration from zero remains required for new/disposable installations, but it does not replace supported Phase 20-baseline upgrade and data-preservation proof.

## Repository

`jfin602/news-scraper` — default branch `main`.
