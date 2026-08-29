import type { RawItem } from '../raw-item.ts';
import { collectionPlainText } from '../text/plain-text.ts';

/** Applies the Source-owned Include/Exclude gate to one parsed RSS/Atom item. */
export function isSourceRssAtomItemAdmitted(
  rawItem: RawItem,
  policy: Readonly<{
    readonly rssAtomAdmissionIncludePhrases: readonly string[];
    readonly rssAtomAdmissionExcludePhrases: readonly string[];
  }>,
): boolean {
  const fields = [rawItem.title, rawItem.content, ...(rawItem.categories ?? [])]
    .filter((value): value is string => value !== undefined)
    .map(comparisonText);

  const matches = (phrases: readonly string[]) =>
    phrases.some((phrase) => {
      const normalizedPhrase = comparisonText(phrase);
      return (
        normalizedPhrase.length > 0 &&
        fields.some((field) => field.includes(normalizedPhrase))
      );
    });
  const includePasses =
    policy.rssAtomAdmissionIncludePhrases.length === 0 ||
    matches(policy.rssAtomAdmissionIncludePhrases);
  return includePasses && !matches(policy.rssAtomAdmissionExcludePhrases);
}

function comparisonText(value: string): string {
  return collectionPlainText(value).normalize('NFKC').toLowerCase();
}
