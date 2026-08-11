# ADR: Single-Publication Simplified Data Model

**Status:** Accepted  
**Date:** 2026-08-11

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

Before production compatibility is established, the supported database setup path is **rebuild from zero** using the current repository migration chain and bootstrap/configuration workflow.

The repository does not guarantee an in-place upgrade path for databases created by earlier pre-production source trees. Foundational schema corrections may therefore update the current migration chain directly when that produces the smallest correct canonical schema.

Migration-from-zero must deterministically produce the complete supported schema. Tests must prove the final constraints, transactions, identity, provenance, and runtime behavior against fresh disposable PostgreSQL. Compatibility columns, dual schemas, data-copy bridges, or transformation code are not added solely to preserve disposable pre-production database contents.

## Consequences

### Positive

- Source, Article, observation, feed, scheduler, admin, and future editorial code do not carry an impossible tenant dimension.
- Database joins, uniqueness constraints, repository APIs, fixtures, and tests are smaller and easier to reason about.
- Provenance remains explicit through Source, endpoint, Collection run, Article, and observation relationships.
- Topic independence is preserved because editorial behavior remains data/configuration and another topic uses another deployment of the same codebase.
- Pre-production schema corrections do not accumulate compatibility machinery for disposable data.

### Costs

- Existing implementation and tests that carry Publication IDs/slugs/scopes must be corrected.
- Databases created by older pre-production source trees may need to be recreated and bootstrapped.
- A future requirement to host multiple Publications concurrently would require a new architecture/data-model project.
- Production upgrade compatibility, when required, needs its own explicit migration contract.

## Rejected alternatives

### Keep Publication IDs because they may be useful later

Rejected. A hypothetical future multi-Publication requirement does not justify carrying tenancy joins, keys, arguments, and tests through every current feature.

### Remove the Publication concept entirely

Rejected. The installed news product still needs one coherent configuration for name, collection/public state, branding, Categories, Relevance, Sources, priority, and presentation.

### Flatten Source/endpoint/run/Article provenance as well

Rejected. Those relationships encode real ownership, identity, safety, and provenance.

### Preserve disposable pre-production database contents through compatibility migrations

Rejected. Before production, rebuilding from the canonical migration chain is simpler than carrying compatibility schema or transformation paths for data that does not require preservation.

## Compliance check

A change violates this ADR when it:

- introduces topic-specific shared-engine behavior;
- requires readers or ordinary runtime flows to select a Publication;
- adds or preserves a Publication ID/slug/foreign-key/scope solely for hypothetical concurrent Publication hosting;
- creates Publication-scoped Source, Category, Relevance, Article, duplicate, scheduler, or admin behavior where installation scope is sufficient;
- removes genuine Source/endpoint/run/Article/observation integrity or provenance; or
- adds pre-production database compatibility machinery without a concrete supported-data requirement.

Any future proposal for concurrent multi-Publication hosting inside one installation or durable production upgrade compatibility requires an explicit contract/ADR change and deliberate data-model work.