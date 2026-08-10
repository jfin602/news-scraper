import type { ArticleCandidate } from '../normalization/article-candidate.ts';
import {
  effectiveEndpointDomainRules,
  hostMatchesDomainRule,
  normalizeDomainHostname,
  type DomainRule,
} from '../../sources/configuration.ts';

export interface ArticleLinkPolicyContext {
  readonly sourceDomainRules: readonly DomainRule[];
  readonly endpointDomainRules?: readonly DomainRule[];
}

export type ArticleLinkPolicyRejectionReason =
  | 'invalid_article_url'
  | 'unsupported_article_scheme'
  | 'article_url_credentials_not_allowed'
  | 'article_domain_not_approved';

export type ArticleLinkPolicyDecision =
  | Readonly<{ accepted: true; candidate: ArticleCandidate }>
  | Readonly<{
      accepted: false;
      stage: 'article_link_policy';
      reason: ArticleLinkPolicyRejectionReason;
    }>;

export function applyArticleLinkPolicy(
  candidate: ArticleCandidate,
  context: ArticleLinkPolicyContext,
): ArticleLinkPolicyDecision {
  let url: URL;
  try {
    url = new URL(candidate.originalUrl);
  } catch {
    return rejection('invalid_article_url');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return rejection('unsupported_article_scheme');
  }
  if (url.username !== '' || url.password !== '') {
    return rejection('article_url_credentials_not_allowed');
  }

  let hostname: string;
  try {
    hostname = normalizeDomainHostname(url.hostname);
  } catch {
    return rejection('invalid_article_url');
  }

  const effectiveRules = effectiveEndpointDomainRules(
    context.sourceDomainRules,
    context.endpointDomainRules,
  );
  if (!effectiveRules.some((rule) => hostMatchesDomainRule(hostname, rule))) {
    return rejection('article_domain_not_approved');
  }

  return Object.freeze({ accepted: true, candidate });
}

function rejection(
  reason: ArticleLinkPolicyRejectionReason,
): ArticleLinkPolicyDecision {
  return Object.freeze({
    accepted: false,
    stage: 'article_link_policy',
    reason,
  });
}
