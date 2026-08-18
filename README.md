# News Scraper

News Scraper is a reusable, topic-independent news aggregation Platform. It collects Article metadata from administrator-approved Sources, normalizes Source-specific input, persists Source instances idempotently with endpoint/run provenance, groups true duplicates without deleting their Source records, and publishes a rolling headline feed that sends readers to original publishers.

Each deployed installation hosts exactly one Publication/topic. The first deployment covers publishing-industry news relevant to indie authors; its Sources, Categories, Relevance rules, and branding are configuration, not shared-engine logic. Another topic uses another configured deployment of the same codebase. Publication is singleton editorial configuration, not a relational tenancy key.

The canonical customer surfaces are:

```text
GET /          # public rolling feed
GET /api/feed  # public feed API
```

## Current state

The Platform is launched. Accepted Phase 20 customer-launch evidence establishes the first supported production source/version/schema baseline. **Phase 21 — Codebase simplification and maintainability hardening** is the current and terminal documented roadmap phase: it preserves launched behavior and supported production data while removing evidence-backed accidental complexity. New product features remain frozen until Phase 21 closes, apart from bounded critical production, security, data-integrity, or operational fixes.

Detailed phase status, including the qualified Phase 9 and Phase 14 owner acceptances, lives in `docs/roadmap/mvp-roadmap.md` and `docs/validation/`. Historical validation remains evidence only for the exact source tree and environment recorded.

## Architecture

```text
Cloudflare Access-protected Admin UI/API       Root Public Feed
                    \                           /
                     -------- Web/API ----------
                              |
                          PostgreSQL
                              |
                  durable jobs/scheduler
                              |
                           Worker
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
            duplicate review/grouping → feed
```

Web/API serves normalized public/admin read models and never collects Sources inline. Worker collection validates approval, lifecycle/operational state, and every request/redirect before contact. RSS/Atom and bounded static-HTML adapters produce the same Raw-item contract; the optional Source RSS/Atom admission filter applies only to RSS/Atom before normalization. All accepted candidates share normalization, Article-link policy, Relevance/Category, Source-scoped identity, persistence, observation, duplicate, and run-accounting boundaries.

The public headline destination is stored Article `original_url`; canonicalized URLs remain identity fields. Article identity answers whether one Source instance was already stored, while duplicate grouping relates separately retained Articles across Sources. Collection state does not itself hide retained otherwise-eligible public rows.

See `docs/architecture/system-architecture.md` and the contracts for authoritative detail.

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
- `docs/contracts/domain-and-data-contract.md` — terminology, state, identity, provenance, and persistence semantics.
- `docs/contracts/source-and-collection-contract.md` — Source trust, network safety, adapters, pipeline, and run accounting.
- `docs/contracts/article-lifecycle-and-deduplication.md` — visibility, duplicate review/groups, and Primary behavior.
- `docs/contracts/public-feed-and-admin-contract.md` — public/feed/admin behavior.
- `docs/contracts/testing-and-validation-contract.md` — regression and evidence requirements.
- `docs/architecture/system-architecture.md` — process, module, pipeline, scheduling, and transaction ownership.
- `docs/operations/` — onboarding, security/reliability, backup/restore, deployment, rollback, and incidents.
- `docs/roadmap/mvp-roadmap.md` — phase history, current Phase 21 commitments, and exit gates.
- `docs/decisions/` — Accepted and superseded architectural decisions.
- `docs/design/` — presentation guidance and the isolated `ui-polish` workflow.

The supported production-data boundary is governed by `docs/decisions/production-data-and-schema-compatibility.md`: clean migration from zero remains required for new/disposable installations, but it does not replace supported Phase 20-baseline upgrade and data-preservation proof.

## Repository

`jfin602/news-scraper` — default branch `main`.
