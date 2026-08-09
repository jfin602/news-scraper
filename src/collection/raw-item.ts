/** Minimally interpreted, explicitly untrusted values extracted from a Source. */
export interface RawItem {
  readonly externalId?: string;
  readonly title?: string;
  readonly url?: string;
  readonly publishedAtRaw?: string;
  readonly updatedAtRaw?: string;
  readonly author?: string;
  readonly content?: string;
  readonly imageUrl?: string;
  readonly categories?: readonly string[];
  readonly language?: string;
  readonly diagnostics?: Readonly<Record<string, string>>;
}
