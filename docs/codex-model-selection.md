# Codex model selection and prompt-efficiency workflow

This document refines the repository-wide model/reasoning/usage policy in `BOOT.md` for `/prompt-ass`, `/prompt-plan`, `/prompt-write`, `/revalidate`, and targeted UI prompt planning.

It exists to minimize expected Codex token/credit usage without lowering the correctness floor required by the task. Model family, reasoning effort, and estimated usage are separate decisions. A more expensive model is not automatically safer, a larger prompt or validation matrix is not automatically harder reasoning work, and a task that needs substantial execution headroom does not automatically need a stronger model.

`BOOT.md` remains authoritative for task-stack grammar and execution rules. `scripts/codex-phase-core.mjs` remains the executable authority for which recommendation labels the runner accepts. **A label described here is not executable until it exists in the runner's current `MODEL_CONFIGS`.** Prompt-writing workflows MUST fail closed rather than writing a planned label that the current runner rejects.

## Selection objective

Choose the **lowest expected total-cost configuration that is adequately reliable for the actual task**.

Apply this order:

1. establish the non-negotiable correctness floor from actual task risk;
2. choose the least-expensive model family that has enough base capability;
3. choose the lowest reasoning effort that has enough reasoning depth;
4. compare the resulting configuration against the next-cheaper realistic alternative;
5. escalate only when a concrete observed task characteristic makes the cheaper alternative materially less reliable;
6. during source-level planning, downgrade when investigation removes ambiguity or reveals a smaller implementation boundary;
7. never pre-pay for a hypothetical worst case that the prompt tells Codex to stop and report instead of solving.

Current official OpenAI Codex pricing/model guidance SHOULD be consulted when available rather than copying durable numeric rates into repository policy. Pricing changes do not require documentation edits unless they change the selection rules or supported model matrix.

## Decomposition before model escalation

Model capability does not compensate for an oversized or internally incoherent task boundary. `/prompt-ass` and `/prompt-plan` MUST consider decomposition before escalating merely because one proposed prompt contains several distinct reasoning shapes.

In particular, explicitly consider splitting a task when it combines a complex transactional/state-machine responsibility with a separately consumable read/service/API responsibility and those responsibilities have materially different downstream consumers, test strategies, failure modes, or review boundaries. Prefer separate prompts when each part can be implemented, tested, and reviewed independently without creating an artificial intermediate architecture.

When a later prompt depends on a producer prompt, a missing or incomplete downstream-required interface is first a task-boundary/implementation-completeness problem, not automatic evidence that the producer needed a stronger model. Establish the smallest coherent producer boundary and its complete handoff contract first; only then escalate family or reasoning effort if the resulting task still exceeds the cheaper configuration's correctness floor.

## Model-family roles

The GPT-5.6 family is treated as three capability/cost bands:

| Family  | Default repository role        | Use when                                                                                                                                                                                       |
| ------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Luna`  | economical implementation tier | work is explicit, bounded, deterministic, high-volume, mechanical, or locally nontrivial without requiring strong independent architectural inference                                          |
| `Terra` | balanced engineering workhorse | work requires meaningful cross-file/state/data-integrity reasoning, subtle validation, security-sensitive bounded behavior, or broader integration judgment                                    |
| `Sol`   | exceptional capability tier    | work requires difficult independent architecture, ambiguous contract reconciliation, hard root-cause debugging, novel cross-system inference, or unusually high-risk security/review reasoning |

Do not select Sol merely because code is production-facing, a phase is important, a prompt is long, or a test matrix is broad.

## Reasoning-effort roles

Reasoning effort is selected independently from family:

| Effort                                | Default repository role                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Low` / existing runner label `Light` | mechanical execution, obvious localized edits, simple deterministic transformations                                                               |
| `Medium`                              | ordinary implementation reasoning, several related files, routine test adaptation, explicit state transitions                                     |
| `High`                                | subtle invariants, meaningful edge cases, nontrivial persistence/security/integration reasoning                                                   |
| `Ultra`                               | exceptional concurrency/recovery/transaction/state-machine or architecture reasoning where additional exploration materially improves reliability |

`Ultra` is repository runner vocabulary already in use. Runner implementation/tests remain the authority for its concrete Codex CLI mapping.

## Usage estimation and completion headroom

Estimated usage is an **execution-workload estimate**, independent from model family and reasoning effort. It describes how much source inspection, implementation, debugging, tool use, focused validation, and required final-tree validation the prompt is expected to consume. It is not an intelligence rating and is not currently a machine-significant runner setting.

Estimate usage for the expected cost of **completing the prompt successfully in one run**, not for the smallest allowance that might succeed on an ideal path. Restarting an otherwise healthy run after late execution/tool exhaustion can duplicate source discovery, implementation context, debugging, and validation; modest unused headroom is normally cheaper than that repeated work.

Use these normal baselines:

| Usage | Normal interpretation |
| --- | --- |
| `Low` | Documentation-only work, a tiny mechanical edit, little or no source investigation, and minimal structural/focused validation. |
| `Moderate` | A bounded localized implementation with limited source tracing, focused tests, and a small portable final regression set. |
| `High` | Normal multi-file engineering work with meaningful source tracing and/or debugging, or work crossing database, security, browser, provider, integration, or several required validation steps. |
| `Very High` | Concurrency/recovery/state-machine work, broad cross-system integration, substantial investigation/debugging, live/external qualification, or an independent closeout with broad integrated review/evidence obligations. |

These are defaults, not a mechanical score. A narrowly implemented database task may remain `Moderate`; a conceptually straightforward task may still be `High` because its source tracing and final evidence are substantial. Conversely, a high-capability model recommendation does not force high usage when execution is tiny.

Apply these calibration rules:

- estimate the complete expected run: prerequisite/source inspection + implementation + likely debugging + focused iteration + the final `RUN` validation manifest + required reporting;
- when the estimate is near a category boundary, estimate confidence is `Low`/`Medium`, or the prompt combines substantial investigation/debugging with meaningful final-tree validation, choose the higher usage category;
- do not lower usage merely because prompt prose was shortened, ambiguity was removed, or the model/reasoning recommendation was downgraded; lower it only when the **execution workload** actually became smaller;
- validation optimization and usage headroom are complementary: run the smallest necessary evidence set, then give that necessary work enough room to finish;
- finishing with unused execution headroom is preferable to exhausting the allowance late in an otherwise healthy run and repeating already-completed work;
- a healthy prompt that exhausts its execution/tool allowance and must be rerun is evidence that its usage estimate was too low, unless concrete evidence shows an unrelated one-off failure caused the exhaustion;
- on a rerun after such exhaustion, raise the usage estimate at least one category when possible, or to `Very High` when already at `High`; repeated underruns for comparable task shapes SHOULD raise the future baseline for that class until later evidence justifies lowering it.

Usage calibration must not become an excuse to widen task scope, add redundant validation, increase model capability without cause, or keep a prompt monolithic when decomposition is safer. First remove unnecessary work; then estimate enough headroom for the remaining necessary work to complete once.

## Current runner matrix

The runner currently accepts this economical matrix:

| Label          | Model           | Reasoning effort |
| -------------- | --------------- | ---------------- |
| `Luna Low`     | `gpt-5.6-luna`  | `low`            |
| `Luna Medium`  | `gpt-5.6-luna`  | `medium`         |
| `Luna High`    | `gpt-5.6-luna`  | `high`           |
| `Terra Medium` | `gpt-5.6-terra` | `medium`         |
| `Terra High`   | `gpt-5.6-terra` | `high`           |
| `Terra Ultra`  | `gpt-5.6-terra` | `ultra`          |
| `Sol Light`    | `gpt-5.6-sol`   | `low`            |
| `Sol Medium`   | `gpt-5.6-sol`   | `medium`         |
| `Sol High`     | `gpt-5.6-sol`   | `high`           |
| `Sol Ultra`    | `gpt-5.6-sol`   | `ultra`          |

Each label maps to its GPT-5.6 family and independently selected reasoning effort in current `MODEL_CONFIGS`; prompt writing and task maintenance may use only those executable labels.

Do not add `Luna Ultra` by default. Luna's primary role is economical bounded work; if a task appears to require extreme reasoning, explicitly compare Luna High against Terra High/Ultra instead of assuming maximum effort on the cheapest family is the best total-cost choice.

Do not create compatibility aliases merely for naming symmetry. The existing `Sol Light` label remains canonical unless a separately reviewed runner migration deliberately renames it and handles affected prompt grammar/history.

## Cost-search order

For a normal well-specified implementation task, search for the first adequate configuration approximately in this order:

```text
Luna Low
→ Luna Medium
→ Luna High
→ Terra Medium
→ Terra High
→ Terra Ultra
→ Sol Medium
→ Sol High
→ Sol Ultra
```

This is a **cost-search order, not an intelligence ladder**. Skip directly to the family that the task's base-capability requirement demands.

`Sol Light` is a special capability-heavy/low-reasoning option: consider it when the task appears to benefit materially from Sol's stronger base capability but not from deep reasoning. It is not the default step between Terra and Sol Medium.

Always ask both questions separately:

1. **Is the cheaper option failing because the model family lacks base capability?** If yes, consider moving Luna → Terra → Sol while keeping reasoning moderate.
2. **Is the cheaper option failing because the task needs more deliberate reasoning?** If yes, first consider raising effort within the same family, then compare that total-cost expectation with the next family at a lower effort.

Usage is a third, separate question: **How much execution workload and headroom does this prompt need to finish once?** Do not answer that question by mechanically copying either the model family or reasoning effort.

## Required task classification

Before selecting a configuration, classify the task on these dimensions. The classification is engineering evidence, not a score that mechanically maps to one model.

| Dimension             | Values                                                       |
| --------------------- | ------------------------------------------------------------ |
| Task shape            | `Mechanical` / `Bounded` / `Cross-cutting` / `Investigative` |
| Specification clarity | `Explicit` / `Some ambiguity` / `Material ambiguity`         |
| State coupling        | `Low` / `Moderate` / `High`                                  |
| Integrity risk        | `Low` / `Moderate` / `High`                                  |
| Concurrency           | `None` / `Local` / `Cross-process`                           |
| Security              | `Ordinary` / `Sensitive` / `Architectural`                   |
| Novel inference       | `Low` / `Moderate` / `High`                                  |

Interpretation rules:

- `Mechanical` or `Bounded` + `Explicit` + low/moderate coupling normally starts in Luna.
- Cross-file count alone does not force Terra; ask whether the files participate in one explicit bounded change or require independent system reasoning.
- Database work does not automatically force Terra/Sol. Straightforward schema/repository work with explicit constraints may remain Luna; transaction ownership, concurrency, or subtle integrity interactions can justify Terra.
- Security-sensitive work does not automatically force Sol. A narrow, explicitly governed middleware/control can be Terra; ambiguous trust boundaries or architecture-level security decisions can justify Sol.
- Roadmap/correction closeout prompts are the deliberate exception to the normal implementation cost-search baseline: default them to `Sol Light` so the final independent review gets Sol's stronger base code-reading/review capability without automatically paying for deep reasoning.
- `Ultra` requires an actual reasoning-depth need such as concurrency, recovery, transaction/state-machine interactions, or comparable complexity. Validation volume alone is not a reason.

## Closeout default and three-pass hardening contract

Roadmap-phase and gating-correction closeout prompts SHOULD default to `Sol Light` when that label remains available in the runner. The closeout boundary is an independent final review of work produced by earlier implementation prompts. Its purpose is not merely to certify that the requested feature exists; it deliberately hardens the integrated result against mistakes, missed failure modes, weak edge-case coverage, and structural quality problems that may survive focused implementation prompts. Sol's stronger base code-reading/review capability is therefore intentionally preferred while Light reasoning keeps the normal review economical.

The runner normally stops before this final prompt. `npm run codex:phase -- <task-folder> --closeout` may be useful for a small, low-risk stack when eliminating the manual launch step helps, but it automates invocation only: the resulting closeout remains human review required, is not automatically committed or accepted, and does not weaken this three-pass contract or its escalation rules.

This default does **not** mean repeated low-reasoning passes are equivalent to a deeper model. Every closeout must use three distinct passes:

1. **Contract / evidence pass** — verify the implemented final tree against governing contracts, roadmap exit gates, required evidence levels, focused tests, broader regressions, runtime/database/browser/live prerequisites as applicable, and the exact accepted source tree.
2. **Error / edge-case adversarial pass** — independently derive realistic ways the actual implementation could fail even when the happy path and existing tests are green. Trace the changed behavior through important producers/consumers and deliberately examine applicable invalid/malformed/empty/null/boundary inputs, missing or partial state, repeated/duplicate/idempotent operations, ordering and state-transition combinations, rollback/partial-failure paths, interruption/retry/restart behavior, stale references or race windows where relevant, dependency failures/timeouts, error translation and leakage, authorization/request-integrity boundaries, and interactions with preserved earlier behavior. This pass MUST reason from the implementation and contracts rather than merely checking whether somebody already wrote an edge-case test.
3. **Code-quality / structural pass** — independently inspect the final implementation diff plus important touched producers/consumers for unnecessary duplication, avoidable complexity, dead or compatibility-only code, speculative abstractions, leaky module boundaries, weak ownership boundaries, brittle or missing tests, observability gaps, documentation/task drift, and meaningful behavior-preserving refactors that should use the Terra High handoff below.

The three passes are intentionally different. Rerunning the command matrix does not satisfy either adversarial review pass. A closeout should actively generate plausible failure hypotheses and structural concerns, then determine from source, tests, and executed evidence whether those concerns are already protected, require a bounded repair/test improvement, require a Terra High refactor handoff, or require deeper escalation/replanning.

A closeout MAY add or strengthen focused regression coverage and fix a concrete bounded defect discovered by any pass when the repair is already inside the governing closeout scope, behavior is unambiguous, and the affected broader evidence can be rerun. Typical examples include a missing boundary validation, incorrect bounded error mapping, one rollback omission, one idempotency/retry bug, a small state-preservation regression, or a missing focused negative test for behavior the current code already intends to guarantee.

If any pass exposes material architectural ambiguity, difficult cross-subsystem root cause, concurrency/transaction ownership uncertainty, security-boundary uncertainty, or another defect that cannot be confidently classified and repaired within the bounded closeout contract, stop and escalate rather than attempting to make `Sol Light` reason through a problem that requires deeper analysis.

Escalation is chosen by the reason the default is insufficient:

- if the problem mainly needs deeper reasoning over explicit code/state interactions, compare `Terra High` / `Terra Ultra` against higher-effort Sol options and choose the minimum adequate current label;
- if the problem itself requires stronger independent cross-system inference or ambiguous contract reconciliation, prefer a higher-effort Sol configuration;
- validation volume, prompt length, or the importance of closeout alone are never escalation triggers.

### Closeout refactor handoff

A **meaningful behavior-preserving refactor** discovered by any closeout pass is a distinct handoff condition, not an invitation for `Sol Light` to perform structural cleanup. Examples include moving responsibility across modules/layers, consolidating duplicated shared logic used by multiple consumers, replacing or collapsing an abstraction, reorganizing shared state/data flow, changing a transaction boundary while preserving the governed semantics, or another multi-file structural simplification whose safety depends on tracing important producers and consumers. A small local cleanup, dead branch removal, obvious helper deduplication, or similarly bounded change may remain a normal closeout fix when the governing closeout already permits it.

When a meaningful behavior-preserving refactor is needed, the closeout MUST stop before implementing that refactor and output exactly one self-contained **Terra High refactor remediation prompt**. This is a special implementation handoff and is separate from the normal closeout model-escalation rule above. The generated prompt MUST:

- recommend exactly `Terra High` as its starting configuration;
- state the observed quality problem and concrete evidence that makes structural refactoring necessary;
- define the smallest behavior-preserving refactor boundary, relevant files/modules, and important producers/consumers to trace;
- restate the contracts/invariants that must remain unchanged, including security, data integrity, idempotency, provenance, failure isolation, and public/admin behavior when implicated;
- forbid unrelated cleanup, new product behavior, contract/ADR changes, roadmap expansion, and speculative abstractions;
- preserve the package version already established/required by the interrupted closeout and consume no roadmap or correction prompt number;
- require focused tests for the refactored behavior plus every broader regression/evidence level invalidated by the structural change;
- require a concise implementation report describing the refactor, tests actually run, and any remaining risk, but MUST NOT declare the phase/correction GREEN or finalize the closeout validation artifact;
- instruct Terra High to stop and report rather than force the refactor if source inspection reveals that the work actually requires a product/contract/ADR change, new roadmap scope, difficult concurrency/transaction redesign beyond Terra High's reliable boundary, or another materially different architecture decision.

The generated Terra High remediation prompt is transient manual closeout output. It is not automatically written under `docs/tasks/`, is not a `codex:phase` stack entry, and does not consume a package-version patch number. After the Terra High remediation has been applied and its implementation-level validation is green, rerun the original closeout prompt from the beginning against the resulting tree. Only that rerun may establish the accepted final source tree, complete the durable closeout evidence, and declare GREEN.

If the discovered issue is not a behavior-preserving refactor but instead requires a contract/ADR change, new feature scope, or a genuinely new architecture decision, do not disguise it as this remediation path; stop for the normal planning/correction workflow.

For model assessment/planning, treat `Sol Light` as the provisional closeout baseline. A lower-family closeout recommendation is not the normal cost optimization path because the independent-review capability is intentional; use one only when the repository owner explicitly changes this policy or `Sol Light` is unavailable and the workflow is revalidated. A stronger recommendation still requires a concrete observed escalation trigger.

For prompt writing, every newly written closeout prompt MUST contain distinct contract/evidence, error/edge-case adversarial, and code-quality/structural pass sections, MUST inherit the Terra High refactor-handoff behavior above, and must require the durable validation/final report to record the scope/findings/disposition of both adversarial passes, bounded defects and tests added, whether a refactor handoff occurred before the final rerun, and whether any unresolved finding requires escalation, replanning, or a correction stack.

## `/prompt-ass` model-selection contract

`/prompt-ass` performs a **provisional** selection from roadmap/contracts and known task boundaries. It does not assume the provisional rating will survive source inspection.

For every proposed implementation/closeout prompt, record:

- task-shape classification;
- specification clarity;
- state coupling;
- integrity risk;
- concurrency class;
- security class;
- novel-inference class;
- provisional model family;
- provisional reasoning effort;
- exact recommended configuration, limited to a current runner label;
- complexity / quality floor (`Standard`, `Elevated`, `High`, or `Critical`);
- estimated usage (`Low`, `Moderate`, `High`, or `Very High`);
- usage basis covering expected investigation, implementation/debugging, validation, and completion headroom;
- lower-cost alternative considered;
- why that cheaper option is inadequate, or `None` when the recommendation is already the lowest adequate current option;
- explicit escalation trigger;
- escalation target;
- estimate confidence;
- concise efficiency rationale.

Implementation prompts start from the cheapest plausible family/effort. Closeout prompts start from the `Sol Light` closeout baseline above and escalate only when the known task shape already proves low reasoning insufficient. Estimated usage is chosen separately from that model/reasoning decision and SHOULD include enough headroom for one-run completion under the usage-calibration rules above.

A useful assessment should make the selection auditable, for example:

```text
Recommended: Luna High
Family basis: bounded deterministic implementation with explicit contract
Reasoning basis: several edge cases and regression interactions
Usage: High — multi-file source tracing + focused implementation + portable final regression
Lower-cost alternative: Luna Medium
Why rejected: persistence/accounting invariants justify additional reasoning
Escalation trigger: source inspection exposes shared transaction ownership
Escalation target: Terra High
```

## `/prompt-plan` model-selection contract

`/prompt-plan` is the **real model gate** because it has inspected the implementation, consumers, tests, actual coupling, and validation ownership.

For every assessed prompt:

1. re-evaluate the seven task-classification dimensions using observed source evidence;
2. compare the provisional `/prompt-ass` configuration with at least the next-cheaper realistic option for implementation prompts, or against the `Sol Light` closeout baseline for closeout prompts;
3. downgrade implementation prompts when source inspection makes the task more explicit/local/mechanical than assessment assumed; retain `Sol Light` as the normal closeout floor unless the owner changes the closeout policy or the label is unavailable;
4. escalate only when observed implementation complexity proves the cheaper/default configuration inadequate;
5. identify whether escalation is driven by **base model capability** or **reasoning depth**;
6. record the final configuration and a model-decision delta from `/prompt-ass`;
7. independently finalize estimated usage from the observed source boundary, expected implementation/debugging work, assigned execution environment, and actual validation manifest; include completion headroom rather than mirroring the model rating;
8. when final usage differs from `/prompt-ass`, name the observed workload fact that caused the change; prior execution/tool-limit exhaustion for this prompt or a closely comparable task is affirmative evidence for raising the estimate unless a concrete unrelated cause was established;
9. resolve the Test Necessity Matrix and Test Environment Matrix from `docs/contracts/testing-and-validation-contract.md` into a prompt-specific validation manifest before `/prompt-write`.

The required model delta is one of:

- `Downgraded` — source evidence reduced the required capability/effort;
- `Unchanged` — provisional choice remains the minimum adequate configuration;
- `Escalated` — newly observed complexity requires a more capable/deeper configuration.

For `Downgraded` or `Escalated`, name the observed source fact that caused the change. For `Unchanged`, state why the next-cheaper realistic option still misses the floor. For a closeout remaining at `Sol Light`, state that the stronger-base independent review is intentional and name any deeper-reasoning trigger that would require escalation during execution.

Example:

```text
ASS provisional: Terra High
Observed: leaf repository change; DB constraint already owns invariant; no shared transaction consumer
PLAN final: Luna High
Delta: Downgraded
```

Or:

```text
ASS provisional: Luna High
Observed: scheduler and stale recovery share transaction/state ownership across repositories
PLAN final: Terra High
Delta: Escalated
Driver: reasoning depth and cross-module state coupling
```

Do not retain an expensive provisional rating merely because it was already written in `/prompt-ass`; the `Sol Light` closeout baseline is a deliberate review-policy floor, not an expensive provisional rating inherited from assessment. Conversely, do not lower estimated usage merely because source inspection allowed a cheaper model/reasoning choice when the remaining execution workload and validation burden are still substantial.

### `/prompt-plan` validation manifest contract

For each proposed prompt, `/prompt-plan` MUST classify the actual affected validation surfaces and resolve every relevant evidence class to exactly one state:

- **`RUN`** — required and executable in the prompt's assigned environment;
- **`DEFER`** — required now or by the final gate but intentionally assigned to another environment;
- **`N/A`** — not required by this task/gate.

The manifest MUST identify:

- affected validation surfaces and why they are implicated;
- the prompt execution environment;
- focused iterative evidence;
- final `RUN` commands/procedures as the smallest non-overlapping set;
- every `DEFER` item, its required environment, and the gate by which it must run;
- important evidence explicitly classified `N/A` when omission could otherwise be ambiguous;
- aggregate-command containment so `/prompt-write` does not duplicate subordinate commands already executed by a selected aggregate;
- exact-tree handoff requirements when evidence crosses Windows/VPS/live/reference environments.

Example:

```text
Validation surfaces: normalization + persistence
Execution environment: local Windows Codex

RUN:
- focused normalization tests
- focused database tests
- npm run check
- npm run test:db

DEFER:
- none

N/A:
- PHP runtime
- PHP-backed browser
- live Sources
- live Gemini provider
- reference deployment

Containment:
- npm run check already owns the portable ordinary unit/integration/collection regression set
```

For a PHP-affecting task executed locally, a valid plan might instead classify PHP runtime and PHP-backed browser evidence as `DEFER → VPS` while retaining locally executable producer/consumer tests under `RUN`. Planning MUST NOT convert the expected prerequisite failure into an instruction to run-and-retry locally.

The validation manifest is a correctness and efficiency contract, not an optional prompt hint. A change crossing multiple necessity rows takes their union, and shared helpers inherit important-consumer obligations. Source inspection may increase or decrease the required matrix before prompt writing, but `/prompt-write` must not silently broaden or narrow it afterward.

## `/prompt-write` model-selection contract

`/prompt-write` consumes the finalized `/prompt-plan` model decision, usage estimate, **and validation manifest**. It does **not** perform a fresh speculative upgrade based on prompt length or perceived importance and does not invent a new validation superset.

Before writing each task file:

1. re-read current `MODEL_CONFIGS` and confirm the planned label still exists;
2. confirm repository drift has not materially changed the implementation boundary, model floor, expected execution workload, validation surfaces, or execution-environment assumptions;
3. if the exact finalized configuration is unsupported, stop with `Planning needed` rather than substituting a guessed label;
4. if an implementation task boundary is unchanged and only a safe lower-cost configuration has become available, explicit owner-authorized `/revalidate` may downgrade it without reopening implementation scope; closeout prompts remain subject to the `Sol Light` independent-review baseline above;
5. never silently upgrade because the generated prompt contains many requirements, tests, or validation commands;
6. copy the finalized estimated usage without silently lowering it because the written prompt is concise, explicit, or uses a smaller non-overlapping validation matrix; change it only when repository drift materially changed the expected execution workload;
7. copy the finalized `RUN` / `DEFER` / `N/A` validation manifest into the task in an implementation-ready form, preserving assigned environments and aggregate containment;
8. do not instruct a Windows prompt to knowingly execute VPS-required or live/external evidence; explicitly invoked specialized suites still fail closed if their expected prerequisite is unexpectedly unavailable;
9. do not instruct automatic retries for deterministic prerequisite/environment failures;
10. for every closeout prompt, add distinct error/edge-case adversarial and code-quality/structural review sections after the contract/evidence validation matrix, inherit the Terra High refactor-handoff rule above, permit only governed bounded repairs/test strengthening, and require all three pass outcomes in the durable validation/final report.

The final `MODEL / REASONING / USAGE` block SHOULD contain:

```text
- Recommended configuration: `<current MODEL_CONFIGS label>`.
- Model-family basis: <why Luna/Terra/Sol capability is needed>.
- Reasoning basis: <why Low/Medium/High/Ultra is needed>.
- Complexity / quality floor: `<class>`.
- Estimated usage: `<class>`.
- Usage basis: <expected source investigation + implementation/debugging + validation + completion headroom>.
- Lower-cost alternative considered: `<configuration or none>`.
- Escalation trigger: <specific observed condition, or None>.
- Escalation target: `<configuration or None>`.
- Estimate confidence: `<Low|Medium|High>`.
- Efficiency rationale: <why this is the minimum adequate model/reasoning choice and a sufficient one-run usage estimate>.
```

Only the canonical `Recommended configuration` line is machine-significant unless the runner grammar is deliberately expanded later. Estimated usage remains descriptive planning metadata unless a separately reviewed runner change deliberately gives it executable semantics.

## `/revalidate` behavior

`/revalidate <task or stack>` MUST look for safe model/reasoning downgrades as actively as it looks for required upgrades, while independently checking whether the usage estimate still provides sufficient one-run completion headroom. Unexecuted closeout prompts preserve the deliberate `Sol Light` review baseline unless the owner changes that policy or the label becomes unavailable.

Revalidation should answer:

- Does the task still require the same model family?
- Does it still require the same reasoning effort?
- Does the estimated usage still cover the current source-inspection, implementation/debugging, and final validation workload with reasonable completion headroom?
- Has this prompt, or a closely comparable task class, previously exhausted its execution/tool allowance and required a rerun? If so, is the estimate being raised unless a concrete unrelated cause explains the exhaustion?
- Has a cheaper supported configuration become available for an implementation task without crossing the correctness floor?
- For a closeout, is `Sol Light` still available and does observed complexity require escalation above it?
- Does the validation manifest still match the current changed surfaces, current command containment, and current execution-environment prerequisites?
- Are any previously `DEFER` items now `RUN`, or vice versa, because the assigned execution environment changed?
- Does the closeout contain the required independent error/edge-case adversarial pass rather than relying on the existing test matrix?
- Does the closeout contain the required code-quality/structural pass and Terra High refactor-handoff behavior?
- Has implementation drift introduced stronger coupling/security/concurrency risk?
- Is the prompt long because the task is difficult, or merely because it is explicit?
- Can redundant prompt prose be removed without weakening contracts, tests, evidence requirements, the validation manifest, either adversarial closeout pass, or its refactor handoff?

Historical completed prompts may retain the configuration and usage estimate recorded when executed. Unexecuted prompts should be revalidated after a material model/usage-policy, testing-contract, command-containment, runner-matrix change, or observed tool-limit calibration failure. Unexecuted closeout prompts written under a prior policy should be updated to the `Sol Light` baseline plus the explicit three-pass hardening flow, Terra High refactor handoff, current usage estimate, and current validation manifest before execution when practical.

## Prompt-token discipline

Model savings are only part of usage conservation. Prompt construction must also avoid unnecessary input tokens and unnecessary test execution.

- Reference governing contracts/ADRs by path and restate only task-critical invariants.
- Do not repeat identical requirements in Context, Constraints, Preserved behavior, Acceptance criteria, and Final report unless repetition prevents a concrete failure mode.
- Inspect and list only relevant source/consumers/tests rather than ceremonial exhaustive inventories.
- Keep validation explicit but avoid narrating the same test purpose multiple times.
- Use the resolved validation manifest rather than asking Codex to rediscover the entire repository test matrix during execution.
- Prefer precise acceptance criteria over long motivational prose.
- Prompt length, phase number, number of tests, and perceived feature importance MUST NOT independently increase the model rating.
- A highly explicit prompt often reduces required model reasoning because ambiguity has already been removed.
- Prompt shortening, decomposition, and validation-matrix optimization reduce expected work only to the extent that they actually remove execution. They do not by themselves justify lowering estimated usage while substantial source investigation, implementation/debugging, or required final-tree validation remains.

Never remove required correctness, security, regression, or evidence requirements merely to shorten a prompt or validation run. Optimize away unnecessary work first, then preserve enough usage headroom for the necessary work to complete without a wasteful restart.

## Runner-change discipline

Model-matrix changes are executable tooling changes and must be treated as such.

When adding/removing/renaming a recommendation label:

- update `scripts/codex-phase-core.mjs` and its `MODEL_CONFIGS` / concrete-model validation together;
- update focused runner and prompt-grammar tests;
- verify generated Codex arguments contain the exact model and reasoning setting;
- preserve unknown-label fail-closed behavior;
- update `BOOT.md` machine-grammar/model-policy wording in the same implementation change, as required by BOOT;
- align `AGENTS.md` and `docs/design/ui-workflow.md` when their summaries mention the policy;
- do not change `package.json` version for a non-versioned tooling correction;
- revalidate unexecuted task stacks after the runner matrix changes.