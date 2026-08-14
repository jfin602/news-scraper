import type { RawItem } from '../raw-item.ts';
import { collectionPlainText } from '../text/plain-text.ts';

/** Applies the Source-owned include-only gate to one parsed RSS/Atom item. */
export function isSourceRssAtomItemAdmitted(
  rawItem: RawItem,
  admissionPhrases: readonly string[],
): boolean {
  if (admissionPhrases.length === 0) return true;

  const fields = [rawItem.title, rawItem.content, ...(rawItem.categories ?? [])]
    .filter((value): value is string => value !== undefined)
    .map(comparisonText);

  return admissionPhrases.some((phrase) => {
    const normalizedPhrase = comparisonText(phrase);
    return (
      normalizedPhrase.length > 0 &&
      fields.some((field) => field.includes(normalizedPhrase))
    );
  });
}

function comparisonText(value: string): string {
  return collectionPlainText(value).normalize('NFKC').toLowerCase();
}
