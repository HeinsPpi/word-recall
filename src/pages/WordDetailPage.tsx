import { useLiveQuery } from 'dexie-react-hooks'
import { dictionaryDb } from '../db/dictionaryDb'
import { userDb } from '../db/userDb'
import type { UserWord } from '../types'
import { retrievability } from '../services/fsrsService'
import { SpeakButton } from '../components/SpeakButton'

export function WordDetailPage({ userWord, onBack }: { userWord: UserWord; onBack: () => void }) {
  const data = useLiveQuery(async () => {
    const word = userWord.dictionaryWordId ? await dictionaryDb.words.get(userWord.dictionaryWordId) : null
    const [meanings, definitions, pronunciations, examples, card] = await Promise.all([
      word ? dictionaryDb.meanings.where('wordId').equals(word.id).toArray() : [], word ? dictionaryDb.definitions.where('wordId').equals(word.id).toArray() : [],
      word ? dictionaryDb.pronunciations.where('wordId').equals(word.id).toArray() : [], word ? dictionaryDb.examples.where('wordId').equals(word.id).toArray() : [],
      userDb.studyCards.where('[targetType+targetId]').equals(['word', userWord.id]).first()
    ])
    const logs = card ? await userDb.reviewLogs.where('cardId').equals(card.id).reverse().sortBy('reviewedAt') : []
    return { word, meanings, definitions, pronunciations, examples, card, logs }
  }, [userWord.id])
  if (!data) return <main className="page"><div className="skeleton tall"/></main>
  const r = data.card ? retrievability(data.card) : null
  return <main className="page detail-page"><button className="back" onClick={onBack}>‹ 単語一覧</button><div className="word-title"><div><h1>{userWord.lemma}</h1><p>{data.word?.pos.join(' · ')} {data.word?.cefrLevel && <span className="badge">{data.word.cefrLevel}</span>}</p></div><SpeakButton text={userWord.lemma}/></div>{data.pronunciations.map((x) => <p className="ipa" key={x.id}>/{x.ipa}/ <small>{x.source}</small></p>)}<DetailSection title="日本語意味" rows={[...(userWord.customMeaningJa ? [{ text: userWord.customMeaningJa, source: 'user' }] : []), ...data.meanings]}/><DetailSection title="English definition" rows={[...(userWord.customDefinitionEn ? [{ text: userWord.customDefinitionEn, source: 'user' }] : []), ...data.definitions]}/><DetailSection title="Examples" rows={[...(userWord.customExample ? [{ text: userWord.customExample, source: 'user' }] : []), ...data.examples.map((x) => ({ text: `${x.sentence}${x.translationJa ? `\n${x.translationJa}` : ''}`, source: x.source }))]}/>{data.word?.conflicts?.length ? <p className="notice">複数ソースで情報が異なります：{data.word.conflicts.join('、')}</p> : null}{data.card && <section className="detail-section"><h2>Study</h2><dl className="study-stats"><div><dt>Stability</dt><dd>{data.card.fsrsCardData.stability.toFixed(1)}日</dd></div><div><dt>Difficulty</dt><dd>{data.card.fsrsCardData.difficulty.toFixed(1)}</dd></div><div><dt>Retrievability</dt><dd>{r === null ? '—' : `${Math.round(r * 100)}%`}</dd></div><div><dt>Next review</dt><dd>{formatDate(data.card.fsrsCardData.due)}</dd></div><div><dt>Review count</dt><dd>{data.logs.length}</dd></div><div><dt>Status</dt><dd>{data.card.mastered ? '定着' : '学習中'}</dd></div></dl></section>}<section className="detail-section"><h2>Review history</h2>{data.logs.length ? data.logs.slice(0, 30).map((log) => <div className="history-row" key={log.id}><span>{formatDate(log.reviewedAt)}</span><strong>{['', 'Again', 'Hard', 'Good', 'Easy'][log.rating]}</strong></div>) : <p className="muted">まだ復習履歴はありません。</p>}</section><label className="memo">User memo<textarea value={userWord.customMemo ?? ''} onChange={(e) => void userDb.userWords.update(userWord.id, { customMemo: e.target.value || null })} placeholder="自分用のメモ"/></label><section className="detail-section"><h2>Data sources</h2><p>{data.word?.sources.join(' / ') ?? 'user provided'}</p><p className="muted">{data.word?.sourceStatus ?? 'user provided'}</p></section></main>
}
function DetailSection({ title, rows }: { title: string; rows: { text: string; source: string }[] }) { if (!rows.length) return null; return <section className="detail-section"><h2>{title}</h2>{rows.map((row, i) => <div className="sourced" key={`${row.text}-${i}`}><p>{row.text}</p><small>{row.source}</small></div>)}</section> }
function formatDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
