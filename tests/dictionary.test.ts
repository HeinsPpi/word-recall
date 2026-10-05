import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dictionaryDb } from '../src/db/dictionaryDb'
import { getWordDetails, searchDictionary } from '../src/services/dictionaryService'
import { registerWord } from '../src/services/userService'
import { userDb } from '../src/db/userDb'
import type { DictionaryWord } from '../src/types'

const word: DictionaryWord = { id:'w-study', lemma:'study', normalizedLemma:'study', pos:['verb'], cefrLevel:'A1', cefrSource:'CEFR-J', sourceCount:3, sourceStatus:'confirmed', sources:['CEFR-J','DiQt','Wiktionary'] }
beforeEach(async () => { await dictionaryDb.words.put(word); await dictionaryDb.wordForms.put({ id:'f-studies', wordId:word.id, form:'studies', normalizedForm:'studies', formType:'third-person singular', source:'Wiktionary' }); await dictionaryDb.expressions.put({ id:'x-account-for', text:'account for', normalizedText:'account for', cefrLevel:'B2', inPhraseList:false, inPhaveList:true, sourceCount:2, sourceStatus:'supported', sources:['PHaVE','Wiktionary'] }); await dictionaryDb.wiktionaryExistence.put({ normalizedLemma:'sesquipedalian', lemma:'sesquipedalian', pos:'adjective' }) })
afterEach(async () => { await dictionaryDb.delete(); await dictionaryDb.open(); await userDb.delete(); await userDb.open() })
describe('dictionary lookup and registration', () => {
  it('finds exact lemma', async () => expect((await searchDictionary(' STUDY ')).kind).toBe('word'))
  it('resolves form to lemma', async () => { const result = await searchDictionary('studies'); expect(result.kind).toBe('word'); if(result.kind==='word') expect(result.details.word.lemma).toBe('study') })
  it('uses existence index when details are absent', async () => expect((await searchDictionary('sesquipedalian')).kind).toBe('existence'))
  it('finds an expression directly', async () => expect((await searchDictionary('account for')).kind).toBe('expression'))
  it('prevents duplicate headword registration', async () => { const details = await getWordDetails(word); expect(details.word.cefrLevel).toBe('A1'); const first = await registerWord(word,{lemma:'study'}); const second = await registerWord(word,{lemma:'study'}); expect(first.id).toBe(second.id); expect(await userDb.userWords.count()).toBe(1) })
  it.each(['A1','A2','B1','B2','C1','C2'] as const)('allows %s headwords', async (level) => { const candidate = {...word,id:`w-${level}`,lemma:`word${level}`,normalizedLemma:`word${level}`.toLowerCase(),cefrLevel:level}; await dictionaryDb.words.put(candidate); await registerWord(candidate,{lemma:candidate.lemma}); expect(await userDb.userWords.where('normalizedLemma').equals(candidate.normalizedLemma).count()).toBe(1) })
})
