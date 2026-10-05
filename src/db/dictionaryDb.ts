import Dexie, { type EntityTable } from 'dexie'
import type { Definition, DictionaryExpression, DictionaryWord, Example, ExpressionExample, ExpressionMeaning, ExpressionWord, Meaning, Pronunciation, WiktionaryExistence, WordForm } from '../types'

const activeDictionaryName = typeof localStorage === 'undefined' ? 'WordRecallDictionaryDB' : (localStorage.getItem('wordRecallActiveDictionary') ?? 'WordRecallDictionaryDB')

export class DictionaryDatabase extends Dexie {
  words!: EntityTable<DictionaryWord, 'id'>
  meanings!: EntityTable<Meaning, 'id'>
  definitions!: EntityTable<Definition, 'id'>
  pronunciations!: EntityTable<Pronunciation, 'id'>
  wordForms!: EntityTable<WordForm, 'id'>
  examples!: EntityTable<Example, 'id'>
  expressions!: EntityTable<DictionaryExpression, 'id'>
  expressionWords!: EntityTable<ExpressionWord, 'id'>
  expressionMeanings!: EntityTable<ExpressionMeaning, 'id'>
  expressionExamples!: EntityTable<ExpressionExample, 'id'>
  wiktionaryExistence!: EntityTable<WiktionaryExistence, 'normalizedLemma'>

  constructor(name = activeDictionaryName) {
    super(name)
    this.version(1).stores({
      words: '&id, normalizedLemma, cefrLevel', meanings: '&id, wordId', definitions: '&id, wordId', pronunciations: '&id, wordId',
      wordForms: '&id, normalizedForm, wordId', examples: '&id, wordId', expressions: '&id, normalizedText',
      expressionWords: '&id, wordId, expressionId, [wordId+expressionId]', expressionMeanings: '&id, expressionId',
      expressionExamples: '&id, expressionId', wiktionaryExistence: '&normalizedLemma, lemma'
    })
  }
}
export const dictionaryDb = new DictionaryDatabase()
