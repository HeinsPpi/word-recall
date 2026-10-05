import type { DictionaryExpression } from '../types'

export function isEligibleExpression(expression: DictionaryExpression): boolean {
  const levelEligible = expression.cefrLevel !== null && ['A1', 'A2', 'B1', 'B2'].includes(expression.cefrLevel)
  return levelEligible || expression.inPhraseList || expression.inPhaveList
}

export function expressionPriority(expression: DictionaryExpression): number[] {
  const levelEligible = expression.cefrLevel !== null && ['A1', 'A2', 'B1', 'B2'].includes(expression.cefrLevel)
  return [
    levelEligible && (expression.inPhraseList || expression.inPhaveList) ? 1 : 0,
    expression.inPhaveList ? 1 : 0,
    expression.inPhraseList ? 1 : 0,
    levelEligible ? 1 : 0,
    expression.sourceCount
  ]
}

export function rankExpressions(expressions: DictionaryExpression[]): DictionaryExpression[] {
  return expressions.filter(isEligibleExpression).sort((a, b) => {
    const ap = expressionPriority(a); const bp = expressionPriority(b)
    for (let i = 0; i < ap.length; i += 1) if (ap[i] !== bp[i]) return bp[i] - ap[i]
    return a.text.localeCompare(b.text)
  })
}
