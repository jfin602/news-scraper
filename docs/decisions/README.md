# Architecture Decision Records

This directory records foundational choices that shape multiple modules or constrain future implementations.

## Status values

- **Proposed** — under review.
- **Accepted** — current decision.
- **Superseded** — replaced by a later ADR and retained as historical rationale.
- **Rejected** — considered but not adopted.

## Records

- [`single-publication-simplified-data-model.md`](./single-publication-simplified-data-model.md) — **Accepted**; current one-Publication deployment/data-model authority.
- [`topic-independent-publication-model.md`](./topic-independent-publication-model.md) — **Superseded**; historical decision that first established topic-independent single-Publication deployments while retaining relational Publication scoping.
- [`whitelist-and-structured-feed-first.md`](./whitelist-and-structured-feed-first.md) — **Accepted**.
- [`original-link-and-normalized-metadata.md`](./original-link-and-normalized-metadata.md) — **Accepted**.
- [`cloudflare-access-admin-perimeter.md`](./cloudflare-access-admin-perimeter.md) — **Accepted**.

New ADRs use descriptive filenames rather than sequence numbers. Git history and the date/status inside each record provide chronology.

New ADRs should describe context, decision, consequences, rejected alternatives, and migration effects where relevant. Superseded ADRs remain in place so historical implementation and validation evidence can be interpreted against the architecture that governed them at the time.
