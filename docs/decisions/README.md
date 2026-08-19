# Architecture Decision Records

This directory records foundational choices that shape multiple modules or constrain future implementations.

## Status values

- **Proposed** — under review.
- **Accepted** — current decision.
- **Superseded** — replaced by a later ADR and retained as historical rationale.
- **Rejected** — considered but not adopted.

## Records

- [`headless-distribution-product-boundary.md`](./headless-distribution-product-boundary.md) — **Accepted**; current post-1.0 product-boundary authority defining the headless aggregation/distribution core, administrator control plane, bundled reference frontend, and separation of Source trust from future distribution selection.
- [`single-publication-simplified-data-model.md`](./single-publication-simplified-data-model.md) — **Accepted**; current one-Publication deployment/data-model authority. Its data-model decision remains unchanged; product-surface wording is narrowed by the headless-distribution ADR where applicable.
- [`production-data-and-schema-compatibility.md`](./production-data-and-schema-compatibility.md) — **Accepted**; production-baseline, supported-data preservation, and post-launch schema-upgrade authority.
- [`topic-independent-publication-model.md`](./topic-independent-publication-model.md) — **Superseded**; historical decision that first established topic-independent single-Publication deployments while retaining relational Publication scoping.
- [`whitelist-and-structured-feed-first.md`](./whitelist-and-structured-feed-first.md) — **Accepted**.
- [`original-link-and-normalized-metadata.md`](./original-link-and-normalized-metadata.md) — **Accepted**.
- [`cloudflare-access-admin-perimeter.md`](./cloudflare-access-admin-perimeter.md) — **Accepted**.

New ADRs use descriptive filenames rather than sequence numbers. Git history and the date/status inside each record provide chronology.

New ADRs should describe context, decision, consequences, rejected alternatives, and migration effects where relevant. Superseded ADRs remain in place so historical implementation and validation evidence can be interpreted against the architecture that governed them at the time.