# ADR: Cloudflare Access Admin Perimeter

**Status:** Accepted  
**Date:** 2026-08-06  
**Amended:** 2026-08-11

## Context

The MVP needs to prove the aggregation product quickly: approved Sources should produce normalized, idempotently persisted Articles that appear in a useful public feed. Building a native administrator account, session, role, recovery, and identity-audit system before that vertical slice would delay the tech demo without improving the collection engine.

The MVP still requires a strong administrative access boundary once admin UI/API routes exist.

## Decision

For MVP deployments, Cloudflare Access is the external authentication/access-control perimeter for all administrative UI and administrative API routes.

The MVP application does not implement native administrator accounts, passwords/passkeys, login/logout sessions, account recovery, roles, per-user Publication authorization, or a canonical internal administrator identity.

Administrative deployments MUST prevent direct-origin access from bypassing the Cloudflare Access perimeter. The exact deployment mechanism may use Cloudflare Tunnel, origin firewall restrictions, authenticated origin connectivity, or another documented equivalent, but an unprotected origin path to admin surfaces is not compliant.

Cloudflare Access does not replace application security. When state-changing admin browser actions are introduced, the application MUST provide CSRF protection or an equivalent request-integrity control. Administrative commands MUST validate real resource relationships and domain invariants even though MVP does not implement native per-user permissions.

The singleton Publication configuration is not a tenant authorization key. Resource validation therefore checks actual Source/endpoint/run/Article/observation/duplicate relationships rather than cross-Publication ownership that cannot exist in the supported installation model.

The application MAY store bounded configuration/moderation change history with action, target, prior/new state, timestamp, and reason where applicable. MVP change records do not require a native administrator identifier. Cloudflare identity/access logs are operational evidence, not the application's canonical domain identity.

## Consequences

### Positive
- The critical path stays focused on collection, normalization, persistence, and the public feed.
- Admin access remains protected when the control plane is introduced.
- Native identity/account complexity can be designed later from actual product needs.
- Collection-engine and resource-integrity boundaries do not depend on one authentication implementation.

### Costs
- MVP admin access depends on deployment configuration outside the application.
- Direct-origin protection becomes a required operational invariant.
- MVP application change history cannot guarantee per-user attribution.
- A later native identity system will require a separate contract/ADR and schema work.

## Rejected alternatives

### Build native administrator authentication before collection
Rejected because it delays the first useful product demonstration and is not required by the locked aggregation laws.

### Expose admin routes without an application or edge perimeter
Rejected because administrative mutations require a real access-control boundary.

### Treat Cloudflare Access as sufficient for all application security
Rejected because request integrity, resource validation, secret handling, content safety, and collection-network safety remain application/deployment responsibilities.

## Migration effects

Native administrator identity, application sessions, roles, per-user authorization, account recovery, and identity-linked audit attribution are deferred beyond MVP. Adding them later must not weaken collection approval, Source/endpoint/run/Article provenance, real resource-integrity checks, or existing change-history semantics.

The post-Phase-9 singleton data-model correction removes obsolete Publication tenancy/scoping without weakening this external admin perimeter.

## Compliance check

A change violates this ADR when an MVP admin UI/API route is reachable through an unprotected origin path, when the application introduces an unnecessary native account/session dependency into the MVP critical path, when state-changing admin browser actions lack applicable request-integrity protection, when real resource relationships/domain invariants are not validated, or when Cloudflare Access is treated as a substitute for collection/network/content security controls.
