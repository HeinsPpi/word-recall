import { dictionaryDb } from '../db/dictionaryDb'
import type { Definition, DictionaryExpression, DictionaryWord, Example, ExpressionExample, ExpressionMeaning, Meaning, Pronunciation, StudyPrompt, WiktionaryExistence } from '../types'
import { rankExpressions } from '../utils/expressions'
import { levenshtein } from '../utils/typo'
import { normalizeLookup } from '../utils/normalize'

export interface WordDetails { word: DictionaryWord; meanings: Meaning[]; definitions: Definition[]; pronunciations: Pronunciation[]; examples: Example[] }
export type SearchResult = { kind: 'word'; details: WordDetails; matchedBy: 'lemma' | 'form' } | { kind: 'expression'; details: NonNullable<Awaited<ReturnType<typeof expressionDetails>>> } | { kind: 'existence'; entry: WiktionaryExistence } | { kind: 'missing'; suggestions: DictionaryWord[] }

export async function getWordDetails(word: DictionaryWord): Promise<WordDetails> {
  const [meanings, definitions, pronunciations, examples] = await Promise.all([
    dictionaryDb.meanings.where('wordId').equals(word.id).toArray(), dictionaryDb.definitions.where('wordId').equals(word.id).toArray(),
    dictionaryDb.pronunciations.where('wordId').equals(word.id).toArray(), dictionaryDb.examples.where('wordId').equals(word.id).toArray()
  ])
  return { word, meanings, definitions, pronunciations, examples }
}

export async function searchDictionary(input: string): Promise<SearchResult> {
  const normalized = normalizeLookup(input)
  const exact = await dictionaryDb.words.where('normalizedLemma').equals(normalized).first()
  if (exact) return { kind: 'word', details: await getWordDetails(exact), matchedBy: 'lemma' }
  const form = await dictionaryDb.wordForms.where('normalizedForm').equals(normalized).first()
  if (form) { const word = await dictionaryDb.words.get(form.wordId); if (word) return { kind: 'word', details: await getWordDetails(word), matchedBy: 'form' } }
  const expression = await dictionaryDb.expressions.where('normalizedText').equals(normalized).first()
  if (expression) { const details = await expressionDetails(expression.id); if (details) return { kind: 'expression', details } }
  const existence = await dictionaryDb.wiktionaryExistence.get(normalized)
  if (existence) return { kind: 'existence', entry: existence }
  const prefix = normalized.slice(0, 2)
  const pool = await dictionaryDb.words.where('normalizedLemma').startsWith(prefix).limit(100).toArray()
  const suggestions = pool.map((word) => ({ word, distance: levenshtein(normalized, word.normalizedLemma) })).filter((x) => x.distance <= Math.max(1, Math.floor(normalized.length / 4))).sort((a, b) => a.distance - b.distance).slice(0, 5).map((x) => x.word)
  return { kind: 'missing', suggestions }
}

export async function relatedExpressions(wordId: string): Promise<DictionaryExpression[]> {
  const relations = await dictionaryDb.expressionWords.where('wordId').equals(wordId).toArray()
  const expressions = (await Promise.all(relations.map((r) => dictionaryDb.expressions.get(r.expressionId)))).filter((v): v is DictionaryExpression => Boolean(v))
  return rankExpressions(expressions)
}

export async function expressionDetails(expressionId: string): Promise<{ expression: DictionaryExpression; meanings: ExpressionMeaning[]; examples: ExpressionExample[] } | null> {
  const expression = await dictionaryDb.expressions.get(expressionId); if (!expression) return null
  const [meanings, examples] = await Promise.all([dictionaryDb.expressionMeanings.where('expressionId').equals(expressionId).toArray(), dictionaryDb.expressionExamples.where('expressionId').equals(expressionId).toArray()])
  return { expression, meanings, examples }
}

export function makePrompts(details: WordDetails, custom?: { meaning: string | null; definition: string | null; example: string | null }): StudyPrompt[] {
  const answer = details.word.lemma
  const meaning = custom?.meaning ?? details.meanings.find((m) => m.language === 'ja')?.text ?? null
  const definition = custom?.definition ?? details.definitions[0]?.text ?? null
  const prompts: StudyPrompt[] = []
  if (definition) prompts.push({ type: 'definition', prompt: definition, answer, meaning, definition })
  for (const example of details.examples) {
    const surface = example.targetSurface
    if (surface && normalizeLookup(example.sentence).includes(normalizeLookup(surface))) {
      const pattern = new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      prompts.push({ type: 'exampleCloze', prompt: example.sentence.replace(pattern, '______'), answer: surface, meaning, definition })
    }
  }
  if (custom?.example && normalizeLookup(custom.example).includes(normalizeLookup(answer))) {
    const pattern = new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    prompts.push({ type: 'exampleCloze', prompt: custom.example.replace(pattern, '______'), answer, meaning, definition })
  }
  if (prompts.length === 0 && meaning) prompts.push({ type: 'japaneseFallback', prompt: meaning, answer, meaning, definition })
  return prompts
}

export function makeExpressionPrompts(text: string, meanings: ExpressionMeaning[], examples: ExpressionExample[]): StudyPrompt[] {
  const meaning = meanings.find((m) => m.language === 'ja')?.text ?? null
  const prompts: StudyPrompt[] = []
  for (const example of examples) if (example.targetSurface && normalizeLookup(example.sentence).includes(normalizeLookup(example.targetSurface))) {
    const surface = example.targetSurface; const pattern = new RegExp(surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    prompts.push({ type: 'expressionCloze', prompt: example.sentence.replace(pattern, '______'), answer: text, meaning, definition: null })
  }
  if (prompts.length === 0 && meaning) prompts.push({ type: 'japaneseFallback', prompt: meaning, answer: text, meaning, definition: null })
  return prompts
}
