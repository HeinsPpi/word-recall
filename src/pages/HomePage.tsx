import { useLiveQuery } from 'dexie-react-hooks'
import { DonutChart } from '../components/DonutChart'
import { ensureSettings, userDb } from '../db/userDb'
import { calculateProgress } from '../utils/progress'
import type { Page } from '../components/BottomNav'

export function HomePage({ go }: { go: (page: Page) => void }) {
  const data = useLiveQuery(async () => {
    const settings = await ensureSettings(); const words = await userDb.userWords.filter((w) => w.isActive).count()
    const cards = await userDb.studyCards.toArray(); const now = new Date(); const due = cards.filter((c) => c.introductionSeen && new Date(c.fsrsCardData.due) <= now)
    const newCount = cards.filter((c) => !c.introductionSeen).length
    return { settings, words, mastered: cards.filter((c) => c.targetType === 'word' && c.mastered).length, expressionMastered: cards.filter((c) => c.targetType === 'expression' && c.mastered).length, expressionTotal: cards.filter((c) => c.targetType === 'expression').length, dueWords: due.filter((c) => c.targetType === 'word').length, dueExpressions: due.filter((c) => c.targetType === 'expression').length, newCount }
  }, [])
  if (!data) return <main><div className="skeleton tall"/></main>
  const progress = calculateProgress(data.settings.totalEncounteredWords, data.words, data.mastered)
  const backupAge = data.settings.lastBackupAt ? (Date.now() - new Date(data.settings.lastBackupAt).getTime()) / 86_400_000 : Infinity
  return <main className="page home-page"><header><p className="eyebrow">TODAY</p><h1>学習の現在地</h1></header><section className="hero-card"><DonutChart initiallyKnown={progress.initiallyKnown} mastered={progress.mastered} learning={progress.learning} rate={progress.knownRate}/><div className="legend"><div><i className="gray"/><span>最初から既知</span><strong>{progress.initiallyKnown}</strong></div><div><i className="blue"/><span>アプリで定着</span><strong>{progress.mastered}</strong></div><div><i className="pale"/><span>学習中</span><strong>{progress.learning}</strong></div></div></section>{progress.needsEncounteredUpdate && <p className="notice">単語帳でここまで見た単語数を更新してください。</p>}<section className="metric-row"><article><span>今日の復習</span><strong>{data.dueWords}</strong></article><article><span>新規学習待ち</span><strong>{data.newCount}</strong></article><article><span>熟語復習</span><strong>{data.dueExpressions}</strong></article></section><section className="expression-summary"><span>熟語・表現</span><strong>{data.expressionMastered} / {data.expressionTotal} 定着</strong></section><div className="primary-actions"><button className="primary" onClick={() => go('study')}>学習を始める</button><button className="secondary" onClick={() => go('add')}>単語を追加</button></div>{backupAge > 30 && data.words > 0 && <button className="backup-nudge" onClick={() => go('settings')}>学習データのバックアップをおすすめします</button>}</main>
}
