# ADR: Single-Publication Simplified Data Model

**Status:** Accepted  
**Date:** 2026-08-11  
**Supersedes:** [`topic-independent-publication-model.md`](./topic-independent-publication-model.md)

## Context

News Scraper is reusable across topics, but each supported deployed installation hosts exactly one Publication/topic. Topic independence is a code-reuse and configuration property, not a requirement for one database or runtime to host multiple independently selectable Publications.

Publication identifiers, slugs, foreign keys, ownership joins, and Publication-scoped uniqueness would model a tenancy dimension the product does not support.

The project is pre-production, so the supported database setup path may use the repository's current migration chain and bootstrap/configuration data to create a fresh canonical database.

## Decision

A **Publication** is the singleton owner of topic-specific editorial configuration such as name, collection/public state, branding, presentation settings, Categories, Relevance rules, Sources, and Source priority. Publication is **not** a tenancy or relational ownership key.

The canonical data model:

- persists at most one singleton Publication/settings configuration;
- does not require a Publication UUID or slug for relational scoping;
- does not place Publication foreign keys or redundant Publication IDs on Sources, Articles, Article observations, Categories, Relevance rules, duplicate records, jobs, or related installation-scoped persistence;
- makes Source `config_key` unique installation-wide;
- keeps Source-endpoint identity scoped to Source;
- keeps Article identity scoped to Source;
- keeps endpoint/run and Source/Article/observation relationships that encode real provenance or integrity;
- treats Categories and default Relevance rules as installation-wide editorial configuration, with optional Source scope where defined;
- treats duplicate review/groups as installation-wide Article relationships;
- exposes no Publication selector in ordinary public, Worker, scheduler, bootstrap, or admin flows;
- exposes the public page at `/` and the basic feed API at `/api/feed`;
- preserves topic independence through configuration and separate deployment.

## Pre-production database rule

Before production compatibility is established, the supported database setup path is **destructive rebuild from zero** using the current repository migration chain and bootstrap/configuration workflow.

Databases created by earlier pre-production source trees are disposable. The correction is expected to destroy/recreate those databases rather than preserve or transform their contents. The repository does not guarantee an in-place upgrade path for them.

The active migration tree MUST describe the smallest coherent canonical schema for the current source tree. Superseded pre-production migration steps SHOULD be deleted, squashed, or replaced rather than retained merely to replay schema states the product no longer supports. A single baseline migration is preferred when it is the clearest representation; multiple migration files are justified only when they improve the current canonical design or migration infrastructure rather than preserve obsolete evolution history.

Migration-from-zero must deterministically produce the complete supported schema. Tests must prove the final constraints, transactions, identity, provenance, and runtime behavior against fresh disposable PostgreSQL. Compatibility columns, dual schemas, data-copy bridges, transformation code, upgrade fixtures, or compatibility tests are not added solely to preserve disposable pre-production database contents.

The same cleanup rule applies outside SQL: source files, APIs, types, wrappers, fixtures, tests, configuration paths, and other artifacts that exist only to support the superseded Publication-tenancy/slug-selection model MUST be removed rather than retained for historical compatibility. Historical rationale remains available through Git history, superseded ADRs, historical task prompts, and validation artifacts.

## Consequences

### Positive

- Source, Article, observation, feed, scheduler, admin, and future editorial code do not carry an impossible tenant dimension.
- Database joins, uniqueness constraints, repository APIs, fixtures, and tests are smaller and easier to reason about.
- Provenance remains explicit through Source, endpoint, Collection run, Article, and observation relationships.
- Topic independence is preserved because editorial behavior remains data/configuration and another topic uses another deployment of the same codebase.
- Pre-production schema corrections do not accumulate compatibility machinery for disposable data.
- The active repository remains a description of the supported system rather than a museum of superseded pre-production implementation paths.

### Costs

- Existing implementation and tests that carry Publication IDs/slugs/scopes must be corrected or deleted.
- Databases created by older pre-production source trees must be recreated and bootstrapped.
- Superseded migration files and legacy-only implementation artifacts may be removed from the active tree even though they remain visible in Git history.
- A future requirement to host multiple Publications concurrently would require a new architecture/data-model project.
- Production upgrade/data compatibility is governed separately by [`production-data-and-schema-compatibility.md`](./production-data-and-schema-compatibility.md); this ADR does not define that lifecycle.

## Rejected alternatives

### Keep Publication IDs because they may be useful later

Rejected. A hypothetical future multi-Publication requirement does not justify carrying tenancy joins, keys, arguments, and tests through every current feature.

### Remove the Publication concept entirely

Rejected. The installed news product still needs one coherent configuration for name, collection/public state, branding, Categories, Relevance, Sources, priority, and presentation.

### Flatten Source/endpoint/run/Article provenance as well

Rejected. Those relationships encode real ownership, identity, safety, and provenance.

### Preserve disposable pre-production database contents through compatibility migrations

Rejected. Before production, rebuilding from the canonical migration chain is simpler than carrying compatibility schema or transformation paths for data that does not require preservation.

### Keep obsolete migration/code/test files only as historical documentation

Rejected. Git history, superseded ADRs, task prompts, and validation artifacts already preserve history without imposing legacy structure on the active implementation.

## Compliance check

A change violates this ADR when it:

- introduces topic-specific shared-engine behavior;
- requires readers or ordinary runtime flows to select a Publication;
- adds or preserves a Publication ID/slug/foreign-key/scope solely for hypothetical concurrent Publication hosting;
- creates Publication-scoped Source, Category, Relevance, Article, duplicate, scheduler, or admin behavior where installation scope is sufficient;
- removes genuine Source/endpoint/run/Article/observation integrity or provenance;
- adds pre-production database compatibility machinery without a concrete supported-data requirement; or
- preserves legacy-only migration/source/API/type/test/fixture/configuration structure when deletion produces the smaller canonical supported implementation.

Any future proposal for concurrent multi-Publication hosting inside one installation requires an explicit contract/ADR change and deliberate data-model work. Durable production upgrade/data compatibility is now governed by [`production-data-and-schema-compatibility.md`](./production-data-and-schema-compatibility.md); changing that lifecycle policy requires its own explicit contract/ADR decision.