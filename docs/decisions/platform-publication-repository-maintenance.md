# ADR: Platform and Publication Repository Maintenance

**Status:** Accepted  
**Date:** 2026-08-18

## Context

News Scraper is a reusable, topic-independent aggregation Platform, while the Indie Author news product is the first configured Publication. Through the MVP, both shared engine code and the first Publication configuration have lived in one repository because that was the fastest path to proving the product and its contracts.

At the 1.0.0 transition, that arrangement becomes a maintenance risk. Future work must distinguish between a defect or capability that belongs to the reusable Platform and a change that belongs only to the Indie Author Publication. If the two concerns evolve in one undifferentiated tree, Publication-specific decisions can leak into shared engine behavior. If they are copied into unrelated repositories without shared Git ancestry, generic Platform fixes become manual duplicate work.

The project therefore needs an explicit upstream/downstream repository model before post-MVP feature development resumes.

## Decision

### Repository roles

`jfin602/news-scraper` remains the canonical reusable **Platform** repository. It owns topic-independent application behavior, shared schema and migrations, collection, normalization, persistence, jobs, APIs, generic public/admin capabilities, security, observability, tests, tooling, and reusable presentation behavior.

The Indie Author product moves to a dedicated **Publication repository** created from the Platform's 1.0.0 history rather than from a history-free template copy. The Publication repository retains Git ancestry with `jfin602/news-scraper` so later Platform releases can be merged downstream normally.

The exact downstream repository name is an operator choice made during the Phase 22 transition; the architectural role is fixed by this ADR.

### Change ownership

Every future issue, feature idea, implementation plan, and production fix must be classified by solution ownership:

- **Platform** — the correct solution changes reusable topic-independent behavior and should benefit other Publications.
- **Publication — Indie Author** — the correct solution changes only Indie Author configuration, editorial rules/data, approved Sources, branding/assets, or other Publication-owned state.

Classification follows where the solution belongs, not where the problem was first observed.

A request that genuinely requires both scopes must be split into linked Platform and Publication work rather than implemented as an undifferentiated cross-scope change.

### Direction of change flow

Normal flow is one-way:

`news-scraper Platform release -> Indie Author Publication repository`

Platform changes are implemented, validated, and released in `jfin602/news-scraper` first, then merged into the Publication repository from the corresponding stable Platform release.

Publication-specific commits are not merged upstream wholesale. If work discovered in the Publication repository reveals a reusable engine defect or capability, the generic solution is implemented in `jfin602/news-scraper`, released there, and then merged downstream.

This rule prevents topic-specific code or data from contaminating the reusable Platform while still allowing every Publication to receive shared fixes.

### Git ancestry and remotes

The Indie Author Publication repository must retain ancestry from the 1.0.0 Platform transition. A normal working clone of that repository should use:

- `origin` for the Indie Author Publication repository;
- `upstream` for `jfin602/news-scraper`.

The downstream repository must not be created through a history-free GitHub template operation when doing so would discard the common ancestry needed for ordinary merges.

### Release synchronization

Publication repositories consume deliberate stable Platform releases rather than continuously merging arbitrary in-progress `news-scraper/main` state.

A normal downstream upgrade is:

1. fetch the Platform remote and tags;
2. identify the intended stable Platform release;
3. merge that release into the Publication branch;
4. resolve only genuine ownership-boundary conflicts;
5. run the applicable deterministic, database, browser, security, recovery, and deployment validation for the resulting Publication tree;
6. deploy only after the Publication-specific final tree is green.

A successful merge in Git is not sufficient validation of a downstream upgrade.

### Platform and Publication file ownership

Phase 22 must establish an explicit filesystem/configuration boundary so normal Publication customization does not require editing Platform-owned implementation files.

Platform-owned areas include shared implementation, migrations, reusable tests/tooling, generic UI behavior, and generic configuration schema/validation.

Publication-owned areas include the concrete Indie Author Publication configuration and assets: approved Sources/endpoints, Source admission phrases, Categories, Relevance configuration, branding/presentation values, editorial metadata, and equivalent topic-specific data.

The exact path layout is determined from the Phase 22 final-tree assessment. The objective is a narrow, reviewable Publication overlay rather than a speculative plugin framework.

A Publication-specific requirement that can only be satisfied by changing a Platform-owned implementation file is a signal to determine whether a generic Platform capability is missing. It must not silently become an Indie Author engine fork.

### Schema and migration ownership

Database schema and migrations remain Platform-owned. A Publication-specific request must not introduce a downstream-only schema fork. If the Publication needs a new persisted capability, the generic schema/capability is designed and implemented upstream under the normal production-data compatibility contract, then consumed through Publication configuration downstream.

Supported customer data remains governed by `docs/decisions/production-data-and-schema-compatibility.md` throughout the repository transition.

### Version identity

The Platform's semantic version is owned by `jfin602/news-scraper`. The Indie Author repository records its exact deploy/source commit independently, while its inherited Platform version changes only when a Platform release is adopted.

Publication-only configuration changes do not invent a competing Platform semantic-version sequence. Deployment history, Git commits/tags, and validation artifacts identify Publication-specific revisions.

### Future Publications

The 1.0.0 release is the first preserved reusable Platform baseline and the ancestry point for the Indie Author separation. It is not a requirement that every future Publication start forever from 1.0.0.

New Publications should normally begin from the latest suitable stable Platform release, retain ancestry with the Platform repository, and add only their own Publication-owned configuration/asset layer.

## Phase 22 transition

Phase 22 owns the one-time transition from the combined MVP repository/deployment to this maintained model. It must:

- make Platform-vs-Publication ownership concrete in the source/configuration tree;
- preserve current production data and observed customer behavior while separating reusable Platform state from Indie Author-owned configuration;
- establish the reusable generic Platform 1.0.0 release baseline;
- create the Indie Author downstream repository with shared ancestry;
- restore/apply the Indie Author Publication-owned configuration only in the downstream tree as required;
- establish and document the `origin`/`upstream` relationship and stable-release merge procedure;
- prove at least one controlled no-op or test release synchronization path so the Git relationship is operational rather than theoretical;
- validate the downstream final tree and production cutover without destructive database reset.

The transition may reorganize configuration ownership where necessary, but it must not add unrelated product capability.

## Consequences

### Positive

- generic fixes have one authoritative implementation location;
- the Indie Author product can evolve editorially without polluting shared engine code;
- Git can merge future Platform releases downstream using common ancestry;
- future Publication repositories can reuse the same maintenance model;
- schema, migration, security, and engine contracts remain centrally owned;
- the 1.0.0 Platform release becomes a durable reusable baseline rather than a one-off customer snapshot.

### Costs

- the Indie Author deployment becomes a downstream integration surface that must be validated after Platform upgrades;
- occasional merge conflicts are possible when Publication customization touches Platform-owned areas;
- operators must distinguish Platform version from Publication deployment revision;
- a small amount of release discipline is required to keep downstream Publications current without merging unstable upstream work.

## Rejected alternatives

### Permanent Indie Author branch inside `news-scraper`

Rejected. A long-lived product branch mixes release history and ownership in one repository and tends toward increasingly difficult merges as the Publication and Platform evolve.

### History-free repository copy/template for the active Indie Author product

Rejected. It discards the common ancestry that makes future Platform merges reliable and turns generic fixes into manual duplication.

### Git submodule for the whole Platform

Rejected for the 1.0.0 transition. The application is not currently structured as an independently packaged embedded engine plus shell, and introducing that architecture merely to solve repository synchronization would add unnecessary complexity.

### Immediate extraction into a standalone package/plugin framework

Rejected for the 1.0.0 transition. Shared-history repositories and a clean configuration boundary solve the known maintenance problem with less architectural churn. Packaging can be reconsidered if multiple downstream Publications later demonstrate a concrete need.

### Merge Publication commits upstream when they look reusable

Rejected. Reusability must be designed and validated in the Platform repository deliberately; wholesale reverse merges create an easy path for topic-specific assumptions to enter shared code.

## Compliance check

A change violates this ADR when it:

- implements a reusable Platform fix only in the Indie Author repository;
- merges Indie Author-specific configuration or topic conditionals into the Platform engine;
- creates a downstream-only schema/migration fork;
- creates the active downstream Publication in a way that unnecessarily loses shared Git ancestry;
- routinely synchronizes a Publication from arbitrary unstable Platform commits instead of deliberate releases;
- treats a successful Git merge as sufficient downstream validation; or
- allows normal Publication customization to depend on ongoing edits to shared engine files without first evaluating the missing generic capability.
