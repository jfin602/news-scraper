# Codex model selection and prompt-efficiency workflow

This document refines the repository-wide model/reasoning/usage policy in `BOOT.md` for `/prompt-ass`, `/prompt-plan`, `/prompt-write`, `/revalidate`, and targeted UI prompt planning.

It exists to minimize expected Codex token/credit usage without lowering the correctness floor required by the task. Model family and reasoning effort are separate decisions. A more expensive model is not automatically safer, and a larger prompt or validation matrix is not automatically harder reasoning work.

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

## Model-family roles

The GPT-5.6 family is treated as three capability/cost bands:

| Family | Default repository role | Use when |
| --- | --- | --- |
| `Luna` | economical implementation tier | work is explicit, bounded, deterministic, high-volume, mechanical, or locally nontrivial without requiring strong independent architectural inference |
| `Terra` | balanced engineering workhorse | work requires meaningful cross-file/state/data-integrity reasoning, subtle validation, security-sensitive bounded behavior, or broader integration judgment |
| `Sol` | exceptional capability tier | work requires difficult independent architecture, ambiguous contract reconciliation, hard root-cause debugging, novel cross-system inference, or unusually high-risk security/review reasoning |

Do not select Sol merely because code is production-facing, a phase is important, a prompt is long, or a test matrix is broad.

## Reasoning-effort roles

Reasoning effort is selected independently from family:

| Effort | Default repository role |
| --- | --- |
| `Low` / existing runner label `Light` | mechanical execution, obvious localized edits, simple deterministic transformations |
| `Medium` | ordinary implementation reasoning, several related files, routine test adaptation, explicit state transitions |
| `High` | subtle invariants, meaningful edge cases, nontrivial persistence/security/integration reasoning |
| `Ultra` | exceptional concurrency/recovery/transaction/state-machine or architecture reasoning where additional exploration materially improves reliability |

`Ultra` is repository runner vocabulary already in use. Runner implementation/tests remain the authority for its concrete Codex CLI mapping.

## Target runner matrix

The intended economical matrix is:

- `Luna Low`
- `Luna Medium`
- `Luna High`
- `Terra Medium`
- `Terra High`
- `Terra Ultra`
- existing `Sol Light`
- `Sol Medium`
- `Sol High`
- `Sol Ultra`

The runner correction that introduces Luna/Medium support MUST verify the exact concrete Codex model and reasoning values before making these labels executable. Until that correction is applied, `/prompt-write` and task maintenance may use only labels actually present in current `MODEL_CONFIGS`.

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

## Required task classification

Before selecting a configuration, classify the task on these dimensions. The classification is engineering evidence, not a score that mechanically maps to one model.

| Dimension | Values |
| --- | --- |
| Task shape | `Mechanical` / `Bounded` / `Cross-cutting` / `Investigative` |
| Specification clarity | `Explicit` / `Some ambiguity` / `Material ambiguity` |
| State coupling | `Low` / `Moderate` / `High` |
| Integrity risk | `Low` / `Moderate` / `High` |
| Concurrency | `None` / `Local` / `Cross-process` |
| Security | `Ordinary` / `Sensitive` / `Architectural` |
| Novel inference | `Low` / `Moderate` / `High` |

Interpretation rules:

- `Mechanical` or `Bounded` + `Explicit` + low/moderate coupling normally starts in Luna.
- Cross-file count alone does not force Terra; ask whether the files participate in one explicit bounded change or require independent system reasoning.
- Database work does not automatically force Terra/Sol. Straightforward schema/repository work with explicit constraints may remain Luna; transaction ownership, concurrency, or subtle integrity interactions can justify Terra.
- Security-sensitive work does not automatically force Sol. A narrow, explicitly governed middleware/control can be Terra; ambiguous trust boundaries or architecture-level security decisions can justify Sol.
- Broad validation/closeout execution can remain Luna/Terra when the prompt is evidence-driven and requires stopping rather than redesigning on major defects.
- `Ultra` requires an actual reasoning-depth need such as concurrency, recovery, transaction/state-machine interactions, or comparable complexity. Validation volume alone is not a reason.

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
- lower-cost alternative considered;
- why that cheaper option is inadequate, or `None` when the recommendation is already the lowest adequate current option;
- explicit escalation trigger;
- escalation target;
- estimate confidence;
- concise efficiency rationale.

Start from the cheapest plausible family/effort. Do not begin at Sol/Ultra and work downward.

A useful assessment should make the selection auditable, for example:

```text
Recommended: Luna High
Family basis: bounded deterministic implementation with explicit contract
Reasoning basis: several edge cases and regression interactions
Lower-cost alternative: Luna Medium
Why rejected: persistence/accounting invariants justify additional reasoning
Escalation trigger: source inspection exposes shared transaction ownership
Escalation target: Terra High
```

## `/prompt-plan` model-selection contract

`/prompt-plan` is the **real model gate** because it has inspected the implementation, consumers, tests, and actual coupling.

For every assessed prompt:

1. re-evaluate the seven task-classification dimensions using observed source evidence;
2. compare the provisional `/prompt-ass` configuration with at least the next-cheaper realistic option;
3. downgrade when source inspection makes the task more explicit/local/mechanical than assessment assumed;
4. escalate only when observed implementation complexity proves the cheaper configuration inadequate;
5. identify whether escalation is driven by **base model capability** or **reasoning depth**;
6. record the final configuration and a model-decision delta from `/prompt-ass`.

The required delta is one of:

- `Downgraded` — source evidence reduced the required capability/effort;
- `Unchanged` — provisional choice remains the minimum adequate configuration;
- `Escalated` — newly observed complexity requires a more capable/deeper configuration.

For `Downgraded` or `Escalated`, name the observed source fact that caused the change. For `Unchanged`, state why the next-cheaper realistic option still misses the floor.

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

Do not retain an expensive provisional rating merely because it was already written in `/prompt-ass`.

## `/prompt-write` model-selection contract

`/prompt-write` consumes the finalized `/prompt-plan` decision. It does **not** perform a fresh speculative upgrade based on prompt length or perceived importance.

Before writing each task file:

1. re-read current `MODEL_CONFIGS` and confirm the planned label still exists;
2. confirm repository drift has not materially changed the implementation boundary or model floor;
3. if the exact finalized configuration is unsupported, stop with `Planning needed` rather than substituting a guessed label;
4. if the task boundary is unchanged and only a safe lower-cost configuration has become available, explicit owner-authorized `/revalidate` may downgrade it without reopening implementation scope;
5. never silently upgrade because the generated prompt contains many requirements, tests, or validation commands.

The final `MODEL / REASONING / USAGE` block SHOULD contain:

```text
- Recommended configuration: `<current MODEL_CONFIGS label>`.
- Model-family basis: <why Luna/Terra/Sol capability is needed>.
- Reasoning basis: <why Low/Medium/High/Ultra is needed>.
- Complexity / quality floor: `<class>`.
- Estimated usage: `<class>`.
- Lower-cost alternative considered: `<configuration or none>`.
- Escalation trigger: <specific observed condition, or None>.
- Escalation target: `<configuration or None>`.
- Estimate confidence: `<Low|Medium|High>`.
- Efficiency rationale: <why this is the minimum adequate choice>.
```

Only the canonical `Recommended configuration` line is machine-significant unless the runner grammar is deliberately expanded later.

## `/revalidate` behavior

`/revalidate <task or stack>` MUST look for safe downgrades as actively as it looks for required upgrades.

Revalidation should answer:

- Does the task still require the same model family?
- Does it still require the same reasoning effort?
- Has a cheaper supported configuration become available?
- Has implementation drift introduced stronger coupling/security/concurrency risk?
- Is the prompt long because the task is difficult, or merely because it is explicit?
- Can redundant prompt prose be removed without weakening contracts, tests, or evidence requirements?

Historical completed prompts may retain the configuration used when executed. Unexecuted prompts should be revalidated after a material model-policy or runner-matrix change.

## Prompt-token discipline

Model savings are only part of usage conservation. Prompt construction must also avoid unnecessary input tokens.

- Reference governing contracts/ADRs by path and restate only task-critical invariants.
- Do not repeat identical requirements in Context, Constraints, Preserved behavior, Acceptance criteria, and Final report unless repetition prevents a concrete failure mode.
- Inspect and list only relevant source/consumers/tests rather than ceremonial exhaustive inventories.
- Keep validation explicit but avoid narrating the same test purpose multiple times.
- Prefer precise acceptance criteria over long motivational prose.
- Prompt length, phase number, number of tests, and perceived feature importance MUST NOT independently increase the model rating.
- A highly explicit prompt often reduces required model reasoning because ambiguity has already been removed.

Never remove required correctness, security, regression, or evidence requirements merely to shorten a prompt.

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
