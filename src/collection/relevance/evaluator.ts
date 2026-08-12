import type {
  CategoryTargetIdentity,
  RelevanceAction,
  RelevancePredicateType,
} from './configuration.ts';
import type { ArticleCandidate } from '../normalization/article-candidate.ts';

/** The intentionally small, persistence-free configuration view consumed by Relevance. */
export interface RelevanceRuleForEvaluation {
  readonly configKey: string;
  readonly predicateType: RelevancePredicateType;
  readonly pattern: string;
  readonly action: RelevanceAction;
  readonly priority: number;
  readonly enabled: boolean;
  readonly reason: string;
  readonly sourceId?: string;
  readonly categoryTarget?: CategoryTargetIdentity;
}

export interface EffectiveRelevanceConfiguration {
  readonly rules: readonly RelevanceRuleForEvaluation[];
  readonly sourceDefaultCategory?: CategoryTargetIdentity;
  readonly endpointDefaultCategory?: CategoryTargetIdentity;
}

export type RelevanceDecisionReason =
  | Readonly<{ readonly kind: 'default_include' }>
  | Readonly<{
      readonly kind: 'rule_include' | 'rule_exclude';
      readonly ruleConfigKey: string;
      readonly ruleReason: string;
    }>;

export type CategoryReason =
  | Readonly<{
      readonly kind: 'rule';
      readonly category: CategoryTargetIdentity;
      readonly ruleConfigKey: string;
      readonly ruleReason: string;
    }>
  | Readonly<{
      readonly kind: 'endpoint_default' | 'source_default';
      readonly category: CategoryTargetIdentity;
    }>;

interface DecisionBase {
  readonly decisionReason: RelevanceDecisionReason;
  readonly categoryAssignments: readonly CategoryTargetIdentity[];
  readonly categoryReasons: readonly CategoryReason[];
}

export type RelevanceDecision =
  | Readonly<
      DecisionBase & {
        readonly included: true;
        readonly candidate: ArticleCandidate;
      }
    >
  | Readonly<DecisionBase & { readonly included: false }>;

const EMPTY_CONFIGURATION: EffectiveRelevanceConfiguration = Object.freeze({
  rules: Object.freeze([]),
});

/**
 * Deterministically evaluates a normalized candidate against one already-loaded
 * configuration snapshot. The optional empty snapshot preserves the inactive
 * Phase 7 call path until runtime configuration loading is integrated.
 */
export function evaluateRelevance(
  candidate: ArticleCandidate,
  configuration: EffectiveRelevanceConfiguration = EMPTY_CONFIGURATION,
): RelevanceDecision {
  const matchingRules = configuration.rules.filter(
    (rule) => isApplicable(rule, candidate) && matches(rule, candidate),
  );
  const winningRule = [...matchingRules]
    .filter((rule) => rule.action === 'include' || rule.action === 'exclude')
    .sort(compareDecisionRules)[0];
  const categorization = evaluateCategorization(matchingRules, configuration);
  const decisionReason = decisionReasonFor(winningRule);

  return Object.freeze({
    included: winningRule?.action !== 'exclude',
    ...(winningRule?.action === 'exclude' ? {} : { candidate }),
    decisionReason,
    categoryAssignments: categorization.assignments,
    categoryReasons: categorization.reasons,
  }) as RelevanceDecision;
}

function isApplicable(
  rule: RelevanceRuleForEvaluation,
  candidate: ArticleCandidate,
): boolean {
  return (
    rule.enabled &&
    (rule.sourceId === undefined ||
      rule.sourceId === candidate.provenance.sourceId)
  );
}

function matches(
  rule: RelevanceRuleForEvaluation,
  candidate: ArticleCandidate,
): boolean {
  const pattern = comparable(rule.pattern);
  switch (rule.predicateType) {
    case 'title_contains':
      return comparable(candidate.normalizedTitle).includes(pattern);
    case 'summary_contains':
      return (
        candidate.summary !== undefined &&
        comparable(candidate.summary).includes(pattern)
      );
    case 'source_category_equals':
      return (
        candidate.sourceCategories?.some(
          (category) => comparable(category) === pattern,
        ) ?? false
      );
  }
}

function evaluateCategorization(
  matchingRules: readonly RelevanceRuleForEvaluation[],
  configuration: EffectiveRelevanceConfiguration,
): Readonly<{
  readonly assignments: readonly CategoryTargetIdentity[];
  readonly reasons: readonly CategoryReason[];
}> {
  const rules = matchingRules
    .filter(
      (
        rule,
      ): rule is RelevanceRuleForEvaluation & {
        readonly categoryTarget: CategoryTargetIdentity;
      } => rule.action === 'categorize' && rule.categoryTarget !== undefined,
    )
    .sort(compareCategorizeRules);
  if (rules.length === 0) return defaultCategorization(configuration);

  const categories = new Map<string, CategoryTargetIdentity>();
  for (const rule of rules)
    categories.set(rule.categoryTarget.configKey, rule.categoryTarget);
  return Object.freeze({
    assignments: Object.freeze(
      [...categories.values()]
        .sort((left, right) =>
          compareConfigKeys(left.configKey, right.configKey),
        )
        .map(freezeCategory),
    ),
    reasons: Object.freeze(
      rules.map((rule) =>
        Object.freeze({
          kind: 'rule' as const,
          category: freezeCategory(rule.categoryTarget),
          ruleConfigKey: rule.configKey,
          ruleReason: rule.reason,
        }),
      ),
    ),
  });
}

function defaultCategorization(
  configuration: EffectiveRelevanceConfiguration,
): Readonly<{
  readonly assignments: readonly CategoryTargetIdentity[];
  readonly reasons: readonly CategoryReason[];
}> {
  const category =
    configuration.endpointDefaultCategory ??
    configuration.sourceDefaultCategory;
  if (category === undefined) {
    return Object.freeze({
      assignments: Object.freeze([]),
      reasons: Object.freeze([]),
    });
  }
  const kind =
    configuration.endpointDefaultCategory === undefined
      ? ('source_default' as const)
      : ('endpoint_default' as const);
  const frozenCategory = freezeCategory(category);
  return Object.freeze({
    assignments: Object.freeze([frozenCategory]),
    reasons: Object.freeze([Object.freeze({ kind, category: frozenCategory })]),
  });
}

function decisionReasonFor(
  rule: RelevanceRuleForEvaluation | undefined,
): RelevanceDecisionReason {
  if (rule === undefined) return Object.freeze({ kind: 'default_include' });
  return Object.freeze({
    kind: rule.action === 'exclude' ? 'rule_exclude' : 'rule_include',
    ruleConfigKey: rule.configKey,
    ruleReason: rule.reason,
  });
}

function compareDecisionRules(
  left: RelevanceRuleForEvaluation,
  right: RelevanceRuleForEvaluation,
): number {
  return (
    right.priority - left.priority ||
    Number(right.sourceId !== undefined) -
      Number(left.sourceId !== undefined) ||
    Number(right.action === 'exclude') - Number(left.action === 'exclude') ||
    compareConfigKeys(left.configKey, right.configKey)
  );
}

function compareCategorizeRules(
  left: RelevanceRuleForEvaluation,
  right: RelevanceRuleForEvaluation,
): number {
  return (
    right.priority - left.priority ||
    Number(right.sourceId !== undefined) -
      Number(left.sourceId !== undefined) ||
    compareConfigKeys(left.configKey, right.configKey)
  );
}

function compareConfigKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparable(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function freezeCategory(
  category: CategoryTargetIdentity,
): CategoryTargetIdentity {
  return Object.freeze({
    configKey: category.configKey,
    displayName: category.displayName,
  });
}
