# Phase 3 — Machine credentials and distribution security validation

## Result and identity

- Status: **Phase 3 GREEN — HUMAN REVIEW REQUIRED**.
- Phase 3 base: `6bfaf306660517ed34df4e2a12d6a1f8153c3e4b`.
- P1: `c2fa7d6efd83624ad9a26ac9078a4817e0e52a94` (`1.3.1`).
- P2: `aa2961f5b451f7d2c8af5506f6fc636ea3e4005e` (`1.3.2`).
- P3: `7e50f51bf6cd8e7db0661b4f777176cbe6bc24c2` (`1.3.3`).
- P4: `96240648d1b05749f9c846111a57a0e6eec59b66` (`1.3.4`).
- P5 closeout: HEAD `96240648d1b05749f9c846111a57a0e6eec59b66` plus the uncommitted `package.json` version-only executable diff whose Git binary-diff object identity is `690dd1b9a388dc15c6c4fe9051c9234f5aa1a307`, plus this artifact. Human acceptance and commit remain required.
- Package version: `1.3.5`. No `package-lock.json` or `npm-shrinkwrap.json` exists.
- Observed environment: Node `v24.11.1`; npm `11.6.2`; PostgreSQL client `18.3`; Playwright `1.56.1`. The database suite provisioned real disposable PostgreSQL databases without prerequisite skips.

## Final validation

- `npm run check` — PASS: formatting, lint, typecheck, and 497 tests in 32 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run test:security` — PASS: 10 focused security tests passed; 0 failed/cancelled/skipped/todo.
- `npm run test:db` — PASS: 238 tests in 5 suites passed against real disposable PostgreSQL; 0 failed/cancelled/skipped/todo.
- `npm run test:recovery` — PASS: 1 native PostgreSQL backup/restore test passed; 0 failed/cancelled/skipped/todo.
- `npm run test:browser` — PASS: 44 tests in 7 suites passed; 0 failed/cancelled/skipped/todo.
- `npm run codex:phase:validate -- p1-3` — PASS: exactly contiguous P1–P5, assigned versions `1.3.1`–`1.3.5`, supported model labels, and one final manual P5 closeout.
- `git diff --check 6bfaf306660517ed34df4e2a12d6a1f8153c3e4b...HEAD` — PASS for the committed Phase 3 range.
- `git diff --check` — PASS for the uncommitted closeout tree before this artifact write and again after it.

The source/unit/integration and focused security portions are Level 1–3 evidence. The complete database suite is Level 4 evidence for schema installation, verifier persistence, lifecycle transactions, authentication lookup, migration from zero, and supported production-forward data preservation. The native backup/restore suite is Level 4 recovery evidence for durable credential verifier/lifecycle state. The complete browser suite is Level 5 evidence for the protected one-time-secret administrator workflow and existing admin/public regressions. No Level 7 live-Source or Level 8 deployment/customer evidence is claimed or required because Phase 3 changes neither collection nor deployment and exposes no distribution HTTP route.

## Pass 1 — contract and evidence review

- Credential generation and state: `token.ts` uses Node cryptographic randomness for an independent 128-bit non-secret lookup identity and 256-bit secret. The strict versioned `nsd1` format is bounded and canonical. SHA-256 verifier derivation produces fixed 32-byte verifier material. Migration `0016` stores only UUID identity, indexed lookup identity, verifier, fixed `distribution:read`, bounded label, expiry/revocation/rotation lineage, and lifecycle timestamps. Plaintext is returned only from issue/rotate results. Metadata queries omit verifier bytes, and audit/admin models are assembled explicitly without plaintext or verifier fields.
- Production compatibility: migration `0016` is additive after the retained `0001`–`0015` chain. Real PostgreSQL evidence proves zero-to-current migration and accepted production-state forward upgrade while preserving governed Profile and earlier customer state. Credential verifier/lifecycle state round-trips after service reconstruction and survives native backup/restore. No test persists plaintext as a recovery mechanism.
- Lifecycle and rotation: repository/service transactions own issue, list, revoke, and rotate. Revocation retains the row and repeated revocation is deterministic. Expiry rejects at the exact `now` boundary. Rotation creates a new independently generated credential, records bounded successor lineage, and leaves the predecessor usable until explicit revocation or expiry. Transaction/audit failure rolls back mutations, and no operation recovers or copies predecessor plaintext.
- Machine authentication: `parseBearerCredential` accepts only one exact caller-supplied `Authorization: Bearer <canonical token>` string. It reuses the canonical token parser, indexed repository lookup, verifier derivation, and timing-safe fixed-length comparison. Unknown lookup identities compare against a fixed dummy verifier. Malformed, unknown, wrong-secret, revoked, expired, capability-invalid, corrupt, and persistence-invalid states collapse to the same redacted `unauthenticated` outcome. Successful principals contain only credential ID, lookup ID, and `distribution:read`; no Profile key, administrator authority, or tenant identity exists.
- Rate/abuse foundation: `createMachineRequestGuard` owns separate process-local bounded limiters for authenticated credential IDs and caller-supplied bounded network keys. Trusted client-network extraction remains future HTTP boundary work. The limiter rejects new keys when full rather than evicting active attacker-controlled keys, cleans expired windows, fails closed on invalid clocks/keys/policies, and always returns a positive integral retry interval when limited. Failed authentication never consumes authenticated quota; successful authentication never consumes invalid-auth quota; bearer plaintext is never a key.
- Human administration: create/list/revoke/rotate routes are registered only inside the existing optional protected admin perimeter. Existing JSON parsing and mutation-integrity middleware run before credential commands. Controllers are thin consumers of the lifecycle service. Create/rotate alone return the newly issued plaintext; list/revoke return safe metadata. No recovery/reveal route exists, and a machine bearer header does not satisfy administrator mutation integrity. Local tests prove application boundaries, not Cloudflare Access itself.
- Browser workspace: the workspace uses only the protected Phase 3 routes. One-time plaintext exists only in transient module and text-node state, is replaced before a new secret is shown, and is cleared on dismissal or workspace deactivation. A hard reload reconstructs empty state. It is absent from URLs, browser storage, cookies, ordinary list state, console/error text, and rendered verifier fields. Rotation explicitly states predecessor overlap; revocation retains metadata. Keyboard, focus, narrow-viewport, and existing workspace regressions pass.
- Scope remained bounded: multiple credentials coexist at instance scope without Publication IDs, Profile authorization, or a credential-to-Profile matrix. No distribution HTTP route, cursor/status serialization, PHP/LKG, collection behavior, native human authentication, or post-2.0 capability was implemented.

## Pass 2 — adversarial review

Source structure plus executed unit/security/database/integration/browser evidence protect absent and malformed authorization; exact scheme/space grammar; combined, extra-component, wrong-version, noncanonical, truncated, extended, control-character, and oversized tokens; unknown lookup and wrong secret; verifier length/capability corruption; dummy-verifier and timing-safe comparison paths; exact expiry boundary; revoke/repeated revoke; overlapping old/new authentication; rotate/revoke combinations; service reconstruction; transaction/audit rollback; invalid network keys; exact quota/window boundaries; clock regression; bounded-map saturation and cleanup; credential isolation; invalid-versus-authenticated quota separation; admin-disabled routing; mutation-integrity separation; safe explicit JSON models; secret replacement/dismiss/navigation/reload; and browser storage/URL/console absence.

The independently derived edge cases have the following disposition:

- Lookup collisions and concurrent repeated rotation submissions fail transactionally and boundedly. A unique lookup collision cannot persist a token or partial row; row locking plus the successor uniqueness rule permits one rotation lineage, with competing work rolling back rather than exposing plaintext or corrupting state. No contract requires silent collision recovery.
- An invalid-auth network key already at its limit is rejected before PostgreSQL lookup, which bounds abuse work. This may temporarily block a valid credential from the same future trusted network identity, but does not consume that credential's quota or reveal credential state and is consistent with the explicitly optional network abuse boundary.
- Revocation racing authentication is governed by the state observed by the short authentication read: later requests observe revocation, while no unsupported distributed instantaneous-cutoff guarantee is claimed. Lifecycle writes remain transactional.
- The limiter deliberately uses process-local fixed windows and rejects new keys at capacity instead of early eviction. This trades availability for bounded memory and prevents trivial eviction-based unlimited bypass; it is not represented as distributed enforcement.

Every plausible case is protected by source structure plus executed evidence. No bounded Phase 3 bug/test repair, meaningful behavior-preserving refactor, contract/architecture blocker, or unresolved security finding remains.

## Pass 3 — structural review

Token parsing, token generation, and verifier derivation are centralized in `token.ts`; indexed authentication persistence is centralized in `repository.ts`; authentication decisions are centralized in `machine-authentication.ts`; and quota composition is centralized in `machine-request-guard.ts`. The admin service consumes lifecycle functions and constructs explicit redacted read/audit models. Routers do not know verifier or table topology, and the browser knows only safe API fields plus the immediate one-time plaintext response.

The implementation adds no generic role/capability framework beyond fixed `distribution:read`, Profile authorization scaffold, tenant key, bearer-to-admin coupling, Phase 4 route/status/CORS behavior, persistent limiter, proxy interpretation, third-party crypto dependency, per-authentication database write, deletion/recovery feature, or speculative account system. Secret-containing buffers/results remain narrowly scoped. Raw PostgreSQL and lifecycle-state failure detail do not cross outward boundaries. Tests assert security outcomes and real persistence behavior rather than only implementation strings.

No closeout repair or dead-code removal was required. No meaningful behavior-preserving refactor was identified, and no Terra High remediation handoff occurred.

## Phase 4 producer handoff

| Downstream-required capability | Owning implementation/export | Focused proof |
| --- | --- | --- |
| Strict Authorization Bearer parsing | `parseBearerCredential` | `test/security/machine-authentication.test.ts` canonical-header matrix |
| Token version/shape validation | `parseDistributionCredentialToken` | `test/unit/distribution-credentials.test.ts`; security malformed-token cases |
| Indexed non-secret lookup | `findDistributionCredentialForAuthentication` and `createDistributionCredentialAuthenticationRepository` | `test/database/distribution-credentials.test.ts`; `test/database/machine-authentication.test.ts` |
| Candidate verifier derivation and timing-safe comparison | `deriveDistributionCredentialVerifier`; `distributionCredentialVerifierMatches` | unit verifier proof; focused security authentication proof |
| Dummy verifier for unknown identity | `createMachineAuthenticator` internal fixed dummy path | focused security unknown-credential comparison proof |
| Revocation/expiration/capability authorization | `createMachineAuthenticator` | focused security exact-boundary tests; real PostgreSQL lifecycle authentication test |
| Redacted authenticated principal | `MachineAuthenticationPrincipal` / authenticated result | focused security principal-shape proof |
| Generic unauthenticated outcome | `MachineAuthenticationResult` / `createMachineAuthenticator` | focused security generic-failure matrix; real PostgreSQL reconstruction proof |
| Per-credential rate decision | `createMachineRequestGuard` authenticated limiter | focused security guard test; limiter unit tests |
| Invalid-auth network abuse decision | `createMachineRequestGuard` invalid-auth limiter and `normalizeInvalidAuthNetworkKey` | focused security network-key test; limiter unit tests |
| Positive `retryAfterSeconds` | `BoundedMachineRateLimiter` and guard `rateLimited` result | exact boundary/clock/capacity unit tests; focused guard tests |
| Strict absence of administrator authority | redacted principal plus independent admin perimeter/mutation middleware | focused security admin-separation test; admin HTTP integration tests |
| Instance scope and no Profile permission matrix | credential schema/service/auth types contain no Publication/Profile relation | real PostgreSQL coexistence/constraint tests; source structure review |

Phase 4 can compose this guard with the Phase 2 Profile page producer and remain a thin HTTP controller. It does not need to invent credential SQL, token parsing, verifier work, lifecycle interpretation, quota state, authorization semantics, Article/Profile SQL, cursor semantics, or Profile-specific credential permissions.

## Secret safety, limitations, and next step

Plaintext bearer tokens are generated transiently and returned only by successful issue/rotate commands. They are not persisted in PostgreSQL, audit JSON, metadata/list responses, logs, errors, snapshots, URLs, storage, cookies, or reloadable browser state. Verifier bytes are persisted only in the credential table and selected only through the narrow authentication repository; they are absent from ordinary repository metadata, admin DTOs, audit records, and browser output. Machine principals cannot grant human administrator authority.

No unresolved Phase 3 limitation or blocker remains. No live-Source, deployment, Cloudflare Access, or distribution API-route proof is claimed; those boundaries were unchanged or are future roadmap scope. Process-local rate limiting is intentionally not cross-process enforcement.

This artifact does not perform or authorize conversational roadmap `/closeout` and does not advance to `1.4.0`. After human review accepts and commits this exact closeout tree and artifact, the next workflow step is conversational `/closeout`, which may perform the separately governed package-only transition to the Phase 4 `1.4.0` baseline.
