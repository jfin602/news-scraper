# Phase 22 — 1.0.0 Platform/Publication Repository Transition

**Status:** Explicitly approved successor to Phase 21 on 2026-08-18.  
**Target release:** `1.0.0`  
**Governing decision:** `docs/decisions/platform-publication-repository-maintenance.md`

## Goal

Transition the completed MVP from one combined repository/deployment into a maintainable two-repository model: `jfin602/news-scraper` as the reusable topic-independent Platform and a dedicated downstream Indie Author Publication repository that retains shared Git ancestry and consumes deliberate stable Platform releases.

Phase 22 is the 1.0.0 release transition. It is not a product-feature phase.

## Depends on

- green Phase 21 closeout and accepted final Phase 21 validation;
- the Phase 20 supported production-data baseline remaining intact;
- `docs/decisions/production-data-and-schema-compatibility.md`;
- `docs/decisions/platform-publication-repository-maintenance.md`.

## Entry and version boundary

Because the repository owner has explicitly approved this roadmap extension, Phase 21 is no longer terminal. A green Phase 21 `/closeout` hands off to Phase 22 and creates the normal `0.22.0` successor baseline under the repository version workflow.

Phase 22 may use ordinary `0.22.x` implementation versions while preparing the split. The final release-transition task is a deliberate exception whose purpose is to move the fully validated reusable Platform tree from the final `0.22.x` preparation version to `1.0.0`.

The terminal Phase 22 `/closeout` then verifies the already-created `1.0.0` source tree/release and performs no further package-version write.

No `1.0.0` tag/release may be created before the reusable Platform tree, downstream ancestry plan, production-data preservation plan, and required final validation are green.

## Required ownership model

Future work is classified by where the correct solution belongs, not where the request or defect was observed:

- **Platform** — reusable topic-independent engine/application behavior, schema/migrations, generic UI/admin/API capability, collection/persistence/security/operations/tooling, and generic configuration schema/validation.
- **Publication — Indie Author** — concrete approved Sources/endpoints, Source admission phrases, Categories, Relevance rules/data, branding/assets, editorial metadata, and other topic-specific Publication configuration.

A request that genuinely contains both scopes must be split into linked Platform and Publication work.

Reusable fixes are implemented and released in `jfin602/news-scraper` first, then merged downstream. Publication-specific commits are not reverse-merged into the Platform wholesale.

## Deliverables

### 1. Final ownership inventory

- trace every active Indie Author-specific value, bootstrap/configuration source, asset, test fixture, runtime consumer, and deployment dependency;
- distinguish active Publication-owned state from generic Platform behavior and from historical documentation/evidence that may legitimately mention the initial Publication;
- identify any Publication customization that currently requires editing a shared implementation file;
- classify each such case as either configuration that should move behind the Publication boundary or a missing generic Platform capability that requires explicit planning rather than a downstream fork.

### 2. Explicit Platform/Publication filesystem boundary

- establish the smallest clear configuration/asset boundary that allows an installation to supply its Publication-owned data without changing shared engine implementation;
- keep shared schema, migrations, application logic, generic tests/tooling, and reusable UI behavior Platform-owned;
- keep Indie Author Sources, filters, Categories, Relevance configuration, branding/assets, and editorial values Publication-owned;
- preserve existing singleton Publication behavior and production data;
- do not introduce multi-Publication tenancy, a plugin framework, submodule architecture, or an npm package split merely to satisfy repository separation.

The exact paths are chosen only after inspecting the Phase 22 entry tree. The implementation should prefer a narrow Publication overlay over speculative abstraction.

### 3. Generic reusable Platform 1.0.0 tree

- remove active Indie Author-specific configuration/data from the reusable Platform release tree while retaining generic schemas, validation, fixtures/examples where genuinely useful, and historical evidence where appropriate;
- ensure a fresh Platform installation can be configured for an arbitrary Publication without editing aggregation-engine logic;
- preserve all supported production migration history and generic behavior;
- verify no active topic conditionals or downstream-only schema assumptions are introduced;
- cut the exact validated generic tree as Platform version `1.0.0` and create the corresponding `v1.0.0` release/tag only after the release gate is satisfied.

### 4. Indie Author downstream repository

- create the dedicated Indie Author Publication repository from the Platform 1.0.0 Git history so the repositories share ancestry;
- configure the normal downstream remote relationship: `origin` = Indie Author repository and `upstream` = `jfin602/news-scraper`;
- apply/restore the Indie Author Publication-owned configuration and assets as downstream commits on top of the reusable Platform baseline;
- keep the inherited Platform semantic version at `1.0.0`; Publication-only deployment revisions are identified by their Git commit/tag/deployment evidence rather than by creating a competing Platform version sequence;
- do not add downstream-only migrations or engine branches.

### 5. Backlog and workflow ownership routing

After the concurrent documentation cull is complete, align the maintained project documentation so future issue/idea/planning workflows require the Platform-vs-Publication classification.

At minimum:

- `known-issues.md` retains one issue log but every new entry records solution ownership;
- `feature-ideas.md` retains one idea log but every new entry records solution ownership;
- genuinely mixed requests are split into linked entries;
- BOOT/prompt/review routing tells engineers which repository owns implementation and how Platform releases propagate downstream;
- historical entries are not rewritten beyond the minimum classification/alignment needed to keep their meaning truthful.

### 6. Stable upstream-to-downstream synchronization procedure

Document and prove the normal upgrade path:

1. fetch `upstream` and Platform tags;
2. select a deliberate stable Platform release, not arbitrary in-progress `main`;
3. merge that release into the Publication repository;
4. resolve ownership-boundary conflicts without moving Publication logic upstream accidentally or forking Platform behavior downstream;
5. run the applicable final-tree validation in the Publication repository;
6. deploy only the validated downstream result.

Before Phase 22 closes, prove the Git relationship with at least a controlled no-op synchronization against `v1.0.0` or another bounded test that demonstrates shared ancestry, merge-base correctness, and the documented update procedure without manufacturing a fake product release.

### 7. Production cutover

- transition the existing Indie Author deployment to the downstream repository without destructive database rebuild/reset;
- preserve the accepted production database, Sources, Articles, observations, Categories, Relevance configuration, duplicate/moderation state, change history, and other governed customer data;
- prove the downstream build operates against the supported production-compatible schema/data state;
- verify public feed, admin, Worker/scheduler/collection, security perimeter, backup/recovery, and operational observability on the downstream final tree;
- record the exact pre-cutover Platform/source SHA, `v1.0.0` Platform SHA, downstream Publication SHA, deployment SHA, schema state, and merge-base/ancestry evidence.

## Validation boundary

Phase 22 inherits `docs/contracts/testing-and-validation-contract.md` and the production-data compatibility ADR.

Validation must cover the final generic Platform 1.0.0 tree and the final Indie Author downstream tree separately where their claims differ. A green Platform tree does not prove the Publication overlay/cutover, and a successful Git merge does not prove runtime correctness.

Required evidence includes, as applicable:

- static/unit/integration regression coverage for configuration-boundary changes;
- real PostgreSQL migration-from-zero for the generic Platform tree;
- supported production upgrade/data-preservation evidence for any persisted/schema change;
- collection fixtures and Source-approval/network-safety regressions;
- browser coverage for public/admin behavior affected by the ownership move;
- recovery/security/reference-deployment evidence required by the governing testing contract;
- Git ancestry/merge-base and no-op stable-release synchronization proof;
- non-destructive Indie Author production cutover evidence.

## Out of scope

- unrelated customer-facing or administrator-facing features;
- SEO/SSR implementation, Article descriptions, thumbnails, newsletters, AI summaries, ranking, personalization, or other deferred capability merely because 1.0.0 is being cut;
- native administrator accounts/identity;
- concurrent multi-Publication hosting in one deployment;
- npm-package/plugin extraction, monorepo conversion, or Git submodules without separate evidence and approval;
- a permanent Indie Author branch inside `jfin602/news-scraper`;
- history-free copying of the active Indie Author repository;
- downstream-only database schema or migrations;
- destructive reset of supported production data;
- automatic multi-repository release bots unless separately justified after the manual workflow is proven;
- starting future Publications permanently from 1.0.0 when a newer suitable stable Platform release exists.

## Exit gate

Phase 22 is complete only when:

- the active reusable Platform tree contains no Indie Author-specific engine behavior and no active Indie Author Publication data outside an explicitly generic example/test/historical context;
- Platform-owned and Publication-owned paths/configuration responsibilities are documented and ordinary Indie Author customization no longer requires routine edits to shared engine implementation;
- the exact validated reusable Platform tree is versioned `1.0.0` and the `v1.0.0` release/tag identifies it;
- the Indie Author Publication repository exists with shared ancestry from the Platform 1.0.0 history and has the documented `origin`/`upstream` relationship;
- Indie Author-specific configuration/assets exist downstream without creating a downstream schema/migration fork;
- the stable Platform-release merge procedure is documented and a no-op/bounded ancestry synchronization proof has been observed;
- the Indie Author downstream final tree passes all applicable validation and is deployed against preserved supported production data without destructive reset;
- exact Platform 1.0.0, downstream Publication, deployment, schema, and merge-base SHAs/evidence are recorded durably;
- issue/feature/workflow documentation reflects Platform-vs-Publication solution ownership after the docs cull is integrated;
- a durable Phase 22 validation artifact records the complete 1.0.0 transition, limitations, and any intentionally deferred repository-automation work;
- terminal `/closeout` accepts the already-versioned `1.0.0` tree and reports the roadmap complete unless a later explicit owner-approved extension exists.

## Post-1.0 maintenance rule

`jfin602/news-scraper` remains the authoritative Platform. Stable Platform releases flow downstream into Publication repositories. Publication-specific work remains downstream. Generic needs discovered downstream return to the Platform as separately designed, tested, released work before being consumed by the Publication.

Future Publications should normally start from the latest suitable stable Platform release while retaining shared Git ancestry and adding only their own Publication-owned configuration/asset layer.
