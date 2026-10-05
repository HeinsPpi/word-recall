export function normalizeLookup(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
}

export function normalizeAnswer(value: string): string {
  return normalizeLookup(value).replace(/\s*([-'])\s*/g, '$1')
}
