# ADR: Production Data and Schema Compatibility

**Status:** Accepted  
**Date:** 2026-08-14

## Context

News Scraper deliberately uses a destructive rebuild-from-zero policy while the project is pre-production. That policy keeps the active migration chain and implementation small while schemas are still being corrected and no customer production data is a supported compatibility surface.

The customer-launch roadmap changes that lifecycle. Phase 19 establishes and validates production backup, restore, deployment, rollback, and schema-upgrade procedures. Phase 20 then configures, validates, and hands off the first real customer Publication. Once that launch is accepted, the deployed database contains supported production state that later maintenance and refactoring must preserve.

The repository therefore needs an explicit boundary between disposable pre-production databases and durable supported production data. Without that boundary, later cleanup could incorrectly apply the pre-production migration-squashing/reset rule to a launched customer database.

## Decision

### Before the production baseline

Until Phase 20 customer-launch acceptance establishes the first supported production baseline:

- the existing pre-production destructive rebuild-from-zero rule remains authoritative;
- databases created by superseded pre-production source trees remain disposable;
- legacy-only migrations and compatibility-only source/API/type/test/fixture/configuration paths may be deleted, squashed, replaced, or consolidated when the current canonical system no longer needs them;
- migration-from-zero remains the supported setup path for development, disposable test, and deployed pre-production environments.

This ADR does not retroactively make earlier pre-production database states supported upgrade inputs.

### Establishing the production baseline

Phase 19 MUST establish and validate the operational procedures needed to preserve production data, including backup/restore, deployment/rollback, and schema-upgrade handling.

Acceptance of Phase 20 customer launch establishes the first supported production schema/data baseline. The exact launched source tree/version and deployed schema state MUST be identifiable from the Phase 20 validation/handoff evidence.

### After the production baseline

From the accepted Phase 20 production baseline forward:

- customer production data is durable supported state;
- normal application/schema upgrades MUST preserve supported production data and governed relationships;
- migrations added after the production baseline MUST support forward upgrade from the supported deployed baseline unless a later explicit compatibility policy deliberately narrows the supported upgrade range;
- supported production migration history MUST NOT be squashed, reordered, deleted, or rewritten in a way that prevents a supported deployed database from upgrading safely;
- migration-from-zero MUST continue to build the complete current schema for new installations and disposable test databases;
- development and test databases may remain disposable when they do not represent supported production state;
- schema cleanup/refactoring SHOULD avoid churn that provides no concrete maintainability, correctness, or operational benefit;
- a destructive customer-data reset, data-dropping transformation, or incompatible schema transition requires a separately justified and explicitly approved lifecycle/product decision rather than being treated as ordinary cleanup;
- backup/restore and rollback procedures MUST remain compatible with the active production upgrade policy.

Production compatibility protects real data and upgradeability. It does not require preserving unsupported APIs, wrappers, obsolete source abstractions, dead code, or speculative compatibility layers that are unrelated to supported persisted state.

## Phase 21 implications

Phase 21 is a behavior-preserving simplification and maintainability-hardening phase performed after customer launch. It MUST therefore operate under the post-production rules above.

Phase 21 MAY refactor persistence code or introduce a schema change only when the change has a concrete simplification, correctness, maintainability, or measured operational benefit. If it changes schema or persisted representation, validation MUST prove both:

1. migration from zero to the complete current schema for new/disposable installations; and
2. supported upgrade from the accepted Phase 20 production baseline while preserving required customer data, relationships, provenance, configuration, moderation state, duplicate state, and other governed persistence.

Phase 21 MUST NOT use the earlier pre-production reset policy as permission to destroy or recreate the launched customer database.

## Consequences

### Positive

- pre-production development remains simple until production compatibility is genuinely needed;
- customer launch creates a precise data-preservation boundary rather than an ambiguous gradual transition;
- post-launch refactoring can simplify code without treating customer data as disposable;
- migration tests can distinguish clean-install correctness from supported production-upgrade correctness;
- obsolete code that is unrelated to persisted compatibility can still be removed aggressively.

### Costs

- post-launch schema changes require forward migration and upgrade-preservation evidence;
- supported production migration history becomes part of the compatibility surface;
- some schema cleanups that would have been trivial before launch may require staged migration or may no longer justify their operational cost;
- rollback/restore procedures must account for real deployed schema evolution.

## Rejected alternatives

### Keep using destructive rebuilds after launch

Rejected. Once customer production data is accepted and handed off, destroying/recreating the database is not a safe default maintenance strategy.

### Preserve every historical pre-production schema as an upgrade path

Rejected. Earlier database states were explicitly disposable and do not become supported merely because production compatibility is introduced later.

### Treat production compatibility as permission to keep all old code forever

Rejected. The compatibility surface is supported persisted state and deliberate external/runtime contracts, not dead wrappers, obsolete abstractions, speculative aliases, or implementation history.

### Freeze the schema permanently after launch

Rejected. Future schema evolution remains allowed when justified, but it must be forward-compatible with the supported production baseline and validated accordingly.

## Compliance check

A change violates this ADR when, after Phase 20 production-baseline acceptance, it:

- destroys or recreates customer production data as an ordinary upgrade/refactor path;
- rewrites supported migration history so a supported deployed database can no longer upgrade safely;
- changes persisted representation without required data-preservation/upgrade evidence;
- claims clean migration-from-zero alone proves production upgrade safety;
- silently narrows supported production compatibility without an explicit decision; or
- retains unrelated dead/obsolete implementation solely by mislabeling it as production data compatibility.

This ADR complements, rather than supersedes, `single-publication-simplified-data-model.md`. The singleton ADR remains authoritative for the one-Publication data model and pre-production simplification history; this record defines the production lifecycle boundary that the singleton ADR explicitly deferred until production compatibility became necessary.
