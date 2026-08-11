# ADR: Single-Publication Simplified Data Model

**Status:** Accepted  
**Date:** 2026-08-11  
**Supersedes:** [`topic-independent-publication-model.md`](./topic-independent-publication-model.md)

## Context

News Scraper is reusable across topics, but a supported deployed installation hosts exactly one Publication/topic. The earlier architecture correctly removed public multi-Publication routing while intentionally retaining Publication identifiers, slugs, foreign keys, ownership joins, and Publication-scoped uniqueness throughout persistence.

That retained tenancy shape no longer serves a supported product behavior. It propagates `publication_id` and Publication selection through Source repositories, normalized candidate provenance, Article persistence, observations, feed queries, bootstrap, scheduler planning, admin validation, and future Category/Relevance/duplicate work even though there can be only one Publication in an installation.

The project is pre-production. Maintaining relational multi-Publication machinery for hypothetical future hosting would increase code, migration, query, test, and reasoning complexity without protecting a current invariant.

## Decision

The Platform remains topic independent and each deployed installation still represents exactly one Publication/topic. A **Publication** remains the conceptual owner of topic-specific editorial configuration: name, collection/public state, branding, presentation settings, Categories, Relevance rules, Sources, and Source priority.

Publication is **not** a tenancy or relational ownership key in the forward data model.

The installation persists at most one singleton Publication configuration. Its implementation MAY retain an existing table name during migration, but forward runtime/domain behavior MUST NOT require a Publication UUID, slug, or foreign key merely to scope resources that cannot belong to another Publication in the same installation.

Accordingly, the post-Phase-9 correction will:

- remove Publication foreign keys and redundant Publication IDs from Source, Article, Article-observation, Category, Relevance, duplicate, and related future persistence where installation cardinality already supplies the scope;
- make Source `config_key` unique installation-wide rather than unique within Publication;
- keep Source-endpoint identity scoped to Source;
- keep Article identity scoped to Source;
- keep endpoint/run and Source/Article/observation relationships that encode real provenance or integrity;
- treat Categories and default Relevance rules as installation-wide editorial configuration, with optional Source scope where defined;
- treat duplicate review/groups as installation-wide Article relationships;
- remove Publication slug selection from forward public, Worker, scheduler, bootstrap, and admin flows;
- expose the public page at `/` and basic feed API at `/api/feed`;
- preserve topic independence by configuration and separate deployment, not by speculative in-installation tenancy.

Historical migrations, task prompts, and durable Phase 3–9 validation artifacts remain truthful records of the architecture that existed when they were created. The correction uses a new migration rather than rewriting historical migrations.

If an existing pre-production database contains more than one Publication when the flattening migration runs, migration MUST fail clearly rather than select, merge, or discard one implicitly.

## Consequences

### Positive

- Source, Article, observation, feed, scheduler, admin, and future editorial code no longer carry an impossible tenant dimension.
- Database joins, uniqueness constraints, repository APIs, fixtures, and tests become smaller and easier to reason about.
- Provenance remains explicit through Source, endpoint, Collection run, Article, and observation relationships.
- Topic independence is preserved because editorial behavior remains data/configuration and another topic still uses another deployment of the same codebase.
- Future phases do not accidentally rebuild multi-Publication scheduling, authorization, Relevance, Category, or duplicate scoping.

### Costs

- The correction requires a real schema migration plus coordinated repository/API/test cleanup across existing Phase 3–9 behavior.
- Historical code/tests that accepted Publication IDs or slugs must be updated.
- A future requirement to host multiple Publications concurrently would require a new architecture/data-model project rather than merely turning on dormant tenant columns.

## Rejected alternatives

### Keep Publication IDs because they may be useful later

Rejected. A hypothetical future multi-Publication requirement does not justify carrying tenancy joins, keys, arguments, and tests through every current feature.

### Remove the Publication concept entirely

Rejected. The installed news product still needs one coherent configuration for name, collection/public state, branding, Categories, Relevance, Sources, priority, and presentation. The decision removes relational tenancy, not editorial configuration.

### Flatten Source/endpoint/run/Article provenance as well

Rejected. Those relationships encode real ownership, identity, safety, and provenance. Only the impossible Publication tenancy layer is removed.

### Rewrite historical migrations and validation records

Rejected. Historical evidence must continue to describe the exact schema/routes that were implemented and observed. The correction is additive migration history plus forward contract changes.

## Compliance check

A change violates this ADR when it:

- introduces topic-specific shared-engine behavior;
- requires readers or ordinary runtime flows to select a Publication;
- adds or preserves a Publication ID/slug/foreign-key/scope solely for hypothetical concurrent Publication hosting;
- creates Publication-scoped Source, Category, Relevance, Article, duplicate, scheduler, or admin behavior where installation scope is sufficient;
- removes genuine Source/endpoint/run/Article/observation integrity or provenance while simplifying tenancy; or
- silently chooses among multiple pre-correction Publication records during migration.

Any future proposal for concurrent multi-Publication hosting inside one installation requires an explicit contract/ADR change and a deliberate data-model design; it is not a compatibility mode retained by this MVP.