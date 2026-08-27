# Architecture Decision Records

This directory records foundational choices that shape multiple modules or constrain future implementations.

## Status values

- **Proposed** — under review.
- **Accepted** — current decision.
- **Superseded** — replaced by a later ADR and retained as historical rationale.
- **Rejected** — considered but not adopted.

## Records

- [`headless-distribution-product-boundary.md`](./headless-distribution-product-boundary.md) — **Accepted**; headless product-boundary history, reference-frontend role, and Source-trust/distribution-selection separation; later 2.0 details route to the distribution contracts, and the 2026-08-27 Publication interpretation note routes subject-vertical scope to the multi-vertical ADR.
- [`managed-first-self-hostable-distribution-architecture.md`](./managed-first-self-hostable-distribution-architecture.md) — **Accepted**; managed-first/self-hostable instance architecture and customer presentation ownership, with later notes for the completed PHP/v1 2.0 boundary and the owner-approved 3.0 direction.
- [`single-publication-multi-vertical-editorial-property.md`](./single-publication-multi-vertical-editorial-property.md) — **Accepted**; current interpretation of the singleton Publication as one customer/editorial property that may contain multiple subject verticals/feeds through Distribution Profiles while preserving no-relational-tenancy.
- [`single-publication-simplified-data-model.md`](./single-publication-simplified-data-model.md) — **Accepted**; current one-Publication deployment/data-model authority. Its singleton/no-relational-tenancy decision remains unchanged; the 2026-08-27 multi-vertical ADR amends only its historical one-Publication/one-topic interpretation.
- [`production-data-and-schema-compatibility.md`](./production-data-and-schema-compatibility.md) — **Accepted**; production-baseline, supported-data preservation, and post-launch schema-upgrade authority.
- [`topic-independent-publication-model.md`](./topic-independent-publication-model.md) — **Superseded**; historical decision that first established topic-independent single-Publication deployments while retaining relational Publication scoping.
- [`whitelist-and-structured-feed-first.md`](./whitelist-and-structured-feed-first.md) — **Accepted**.
- [`original-link-and-normalized-metadata.md`](./original-link-and-normalized-metadata.md) — **Accepted**.
- [`cloudflare-access-admin-perimeter.md`](./cloudflare-access-admin-perimeter.md) — **Accepted**; current managed admin perimeter while native self-host admin authentication remains deferred.

New ADRs use descriptive filenames rather than sequence numbers. Git history and the date/status inside each record provide chronology.

New ADRs should describe context, decision, consequences, rejected alternatives, and migration effects where relevant. Superseded ADRs remain in place so historical implementation and validation evidence can be interpreted against the architecture that governed them at the time.
