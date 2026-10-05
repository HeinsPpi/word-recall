import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { dictionaryDb } from '../db/dictionaryDb'
import { ensureSettings, userDb } from '../db/userDb'
import type { ReviewLog, StudyCard, StudyPrompt } from '../types'
import { expressionDetails, getWordDetails, makeExpressionPrompts, makePrompts } from '../services/dictionaryService'
import { scheduleReview } from '../services/fsrsService'
import { normalizeAnswer } from '../utils/normalize'
import { isSafeTypo } from '../utils/typo'
import { SpeakButton } from '../components/SpeakButton'
import { updateDailySnapshot } from '../services/userService'

interface StudyItem { card: StudyCard; label: string; pos: string; cefr: string | null; ipa: string | null; meaning: string | null; definition: string | null; example: string | null; prompts: StudyPrompt[] }
interface AnswerState { rating: 1 | 2 | 3; correct: boolean; typo: boolean; expected: string; user: string }

async function loadItem(card: StudyCard): Promise<StudyItem | null> {
  if (card.targetType === 'word') {
    const userWord = await userDb.userWords.get(card.targetId); if (!userWord) return null
    const dictionaryWord = userWord.dictionaryWordId ? await dictionaryDb.words.get(userWord.dictionaryWordId) : null
    if (dictionaryWord) { const d = await getWordDetails(dictionaryWord); const prompts = makePrompts(d, { meaning: userWord.customMeaningJa, definition: userWord.customDefinitionEn, example: userWord.customExample }); return { card, label: userWord.lemma, pos: dictionaryWord.pos.join(' · '), cefr: dictionaryWord.cefrLevel, ipa: d.pronunciations[0]?.ipa ?? null, meaning: userWord.customMeaningJa ?? d.meanings.find((m) => m.language === 'ja')?.text ?? null, definition: userWord.customDefinitionEn ?? d.definitions[0]?.text ?? null, example: userWord.customExample ?? d.examples[0]?.sentence ?? null, prompts } }
    return { card, label: userWord.lemma, pos: '', cefr: null, ipa: null, meaning: userWord.customMeaningJa, definition: userWord.customDefinitionEn, example: userWord.customExample, prompts: [{ type: userWord.customDefinitionEn ? 'definition' : 'japaneseFallback', prompt: userWord.customDefinitionEn ?? userWord.customMeaningJa ?? '綴りを思い出してください', answer: userWord.lemma, meaning: userWord.customMeaningJa, definition: userWord.customDefinitionEn }] }
  }
  const relation = await userDb.userExpressions.get(card.targetId); if (!relation) return null
  const d = await expressionDetails(relation.expressionId); if (!d) return null
  return { card, label: d.expression.text, pos: 'expression', cefr: d.expression.cefrLevel, ipa: null, meaning: d.meanings.find((m) => m.language === 'ja')?.text ?? null, definition: null, example: d.examples[0]?.sentence ?? null, prompts: makeExpressionPrompts(d.expression.text, d.meanings, d.examples) }
}

export function StudyPage() {
  const cards = useLiveQuery(() => userDb.studyCards.toArray(), [])
  const [queue, setQueue] = useState<StudyCard[] | null>(null); const [item, setItem] = useState<StudyItem | null>(null); const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState(''); const [answerState, setAnswerState] = useState<AnswerState | null>(null); const [hint, setHint] = useState(0); const [startedAt, setStartedAt] = useState(Date.now())
  const [summary, setSummary] = useState<{ reviewed: number; correct: number; again: number; newlyMastered: number; struggled: string[] } | null>(null)
  const resultRef = useRef({ reviewed: 0, correct: 0, again: 0, newlyMastered: 0, struggled: [] as string[] })
  useEffect(() => { if (cards && queue === null) { const now = new Date(); setQueue(cards.filter((c) => !c.introductionSeen || new Date(c.fsrsCardData.due) <= now).sort((a, b) => Number(a.introductionSeen) - Number(b.introductionSeen) || a.fsrsCardData.due.localeCompare(b.fsrsCardData.due))) } }, [cards, queue])
  useEffect(() => { if (!queue) return; if (index >= queue.length) { if (queue.length > 0) { setSummary({ ...resultRef.current }); void updateDailySnapshot() } return } void loadItem(queue[index]).then(setItem) }, [queue, index])
  const prompt = useMemo(() => item?.prompts[item.card.promptCursor % Math.max(1, item.prompts.length)] ?? null, [item])
  if (summary) return <main className="page completion"><p className="eyebrow">SESSION COMPLETE</p><h1>今日の復習終了</h1><div className="completion-grid"><div><span>復習</span><strong>{summary.reviewed}</strong></div><div><span>正解</span><strong>{summary.correct}</strong></div><div><span>要復習</span><strong>{summary.again}</strong></div><div><span>新しく定着</span><strong>{summary.newlyMastered}</strong></div></div>{summary.struggled.length > 0 && <section><h2>今日苦戦した単語</h2><p>{summary.struggled.join(' · ')}</p></section>}<p className="reflection">画面を見ずに、苦戦した語を一度思い出してみましょう。</p><button className="secondary" onClick={() => { setQueue(null); setIndex(0); setSummary(null); resultRef.current = { reviewed: 0, correct: 0, again: 0, newlyMastered: 0, struggled: [] } }}>更新</button></main>
  if (!queue || (queue.length && !item)) return <main className="page"><div className="skeleton tall"/></main>
  if (queue.length === 0) return <main className="page empty-state"><div className="check-mark">✓</div><h1>今日の学習は完了です</h1><p>次の復習時刻になるまで、追加の操作は必要ありません。</p></main>
  if (!item || !prompt) return <main className="page empty-state"><h1>問題を作れません</h1><p>この項目には安全に利用できる定義・例文・意味がありません。単語詳細から情報を追加してください。</p><button onClick={() => setIndex((i) => i + 1)}>次へ</button></main>
  const currentItem = item
  const currentPrompt = prompt
  const isIntro = !item.card.introductionSeen
  async function begin() { await userDb.studyCards.update(currentItem.card.id, { introductionSeen: true }); setItem({ ...currentItem, card: { ...currentItem.card, introductionSeen: true } }); setStartedAt(Date.now()) }
  async function submit() {
    if (!answer.trim() || answerState) return
    const exact = normalizeAnswer(answer) === normalizeAnswer(currentPrompt.answer)
    const valid = await dictionaryDb.words.where('normalizedLemma').equals(normalizeAnswer(answer)).count() > 0
    const typo = !exact && isSafeTypo(answer, currentPrompt.answer, valid, currentItem.card.targetType === 'expression')
    const rating: 1 | 2 | 3 = exact ? (hint > 0 ? 2 : 3) : typo ? 2 : 1
    const state = { rating, correct: exact, typo, expected: currentPrompt.answer, user: answer }; setAnswerState(state)
    const settings = await ensureSettings(); const reviewedAt = new Date(); const log: ReviewLog = { id: `review_${crypto.randomUUID()}`, cardId: currentItem.card.id, reviewedAt: reviewedAt.toISOString(), rating, promptType: currentPrompt.type, userAnswer: answer, expectedAnswer: currentPrompt.answer, usedHint: hint > 0, wasTypo: typo, responseTimeMs: Date.now() - startedAt }
    const logs = [...await userDb.reviewLogs.where('cardId').equals(currentItem.card.id).toArray(), log]
    const updated = scheduleReview(currentItem.card, rating, settings.desiredRetention, logs, settings.masteryStabilityDays, reviewedAt)
    updated.promptCursor += 1
    await userDb.transaction('rw', [userDb.reviewLogs, userDb.studyCards], async () => { await userDb.reviewLogs.add(log); await userDb.studyCards.put(updated) })
    resultRef.current.reviewed += 1; if (exact) resultRef.current.correct += 1; if (rating === 1) { resultRef.current.again += 1; if (!resultRef.current.struggled.includes(currentItem.label)) resultRef.current.struggled.push(currentItem.label) } if (!currentItem.card.mastered && updated.mastered) resultRef.current.newlyMastered += 1
  }
  function next() { setAnswer(''); setAnswerState(null); setHint(0); setItem(null); setStartedAt(Date.now()); setIndex((i) => i + 1) }
  if (isIntro) return <main className="page study-page"><div className="step-count">{index + 1} / {queue.length}</div><section className="intro-card"><p className="eyebrow">FIRST STUDY</p><div className="word-title"><h1>{item.label}</h1><SpeakButton text={item.label}/></div>{item.ipa && <p className="ipa">/{item.ipa}/</p>}<p>{[item.pos, item.cefr].filter(Boolean).join(' · ')}</p>{item.meaning && <StudyInfo label="日本語意味" value={item.meaning}/>} {item.definition && <StudyInfo label="English definition" value={item.definition}/>} {item.example && <StudyInfo label="Example" value={item.example}/>}<button className="primary" onClick={() => void begin()}>覚える</button></section></main>
  return <main className="page study-page"><div className="step-count">{index + 1} / {queue.length}</div><section className="question-card"><p className="prompt-label">{prompt.type === 'definition' ? 'ENGLISH DEFINITION' : prompt.type === 'japaneseFallback' ? 'MEANING' : 'COMPLETE THE SENTENCE'}</p><h1>{prompt.prompt}</h1>{hint >= 1 && <p className="hint" role="status">{prompt.answer[0]}{'_'.repeat(Math.max(1, prompt.answer.length - 1))}</p>}{hint >= 2 && <p className="hint" role="status">{prompt.meaning ?? `${prompt.answer.length}文字 · ${item.pos}`}</p>}<form onSubmit={(e) => { e.preventDefault(); void submit() }}><input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={Boolean(answerState)} aria-label="答え" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}/>{!answerState && <div className="answer-actions"><button type="button" className="secondary" onClick={() => setHint((h) => Math.min(2, h + 1))}>Hint</button><button className="primary" disabled={!answer.trim()}>回答</button></div>}</form>{answerState && <div className={`feedback ${answerState.correct ? 'correct' : answerState.typo ? 'typo' : 'incorrect'}`} aria-live="polite"><h2>{answerState.correct ? 'Correct' : answerState.typo ? 'スペルミス' : 'もう一度覚えよう'}</h2>{!answerState.correct && <p>Your answer <strong>{answerState.user}</strong></p>}<p>Correct answer <strong>{answerState.expected}</strong> <SpeakButton text={answerState.expected}/></p>{prompt.meaning && <p>{prompt.meaning}</p>}{prompt.definition && <p className="muted">{prompt.definition}</p>}<button className="primary" onClick={next}>Next</button></div>}</section></main>
}
function StudyInfo({ label, value }: { label: string; value: string }) { return <div className="study-info"><span>{label}</span><p>{value}</p></div> }
