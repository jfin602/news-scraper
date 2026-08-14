/** Converts bounded Source text into deterministic human-readable plain text. */
export function collectionPlainText(value: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, '$1');
  const withoutExecutable = withoutCdata.replace(
    /<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu,
    ' ',
  );
  const withoutMarkup = withoutExecutable
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<[^>]*>/gu, ' ');
  return decodeEntities(withoutMarkup).replace(/\s+/gu, ' ').trim();
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = Object.freeze({
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  });
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu,
    (entity, decimal: string, hexadecimal: string, name: string) => {
      if (name !== undefined) return named[name.toLowerCase()] ?? entity;
      const codePoint = Number.parseInt(
        decimal ?? hexadecimal,
        decimal ? 10 : 16,
      );
      return isSafeCodePoint(codePoint)
        ? String.fromCodePoint(codePoint)
        : '\uFFFD';
    },
  );
}

function isSafeCodePoint(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
  );
}
