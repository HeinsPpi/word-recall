import { normalizeAnswer } from './normalize'

export function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[b.length]
}

export function isSafeTypo(answer: string, expected: string, answerIsValidWord: boolean, isExpression = false): boolean {
  const a = normalizeAnswer(answer)
  const e = normalizeAnswer(expected)
  return !isExpression && !answerIsValidWord && e.length >= 6 && a.length >= 5 && levenshtein(a, e) === 1
}
