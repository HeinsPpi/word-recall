import { useLiveQuery } from 'dexie-react-hooks'
import { CategoryScale, Chart as ChartJS, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { userDb } from '../db/userDb'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

export function StatsPage() {
  const data = useLiveQuery(async () => { const [words, expressions, cards, reviews, snapshots] = await Promise.all([userDb.userWords.count(), userDb.userExpressions.count(), userDb.studyCards.toArray(), userDb.reviewLogs.count(), userDb.progressSnapshots.orderBy('date').toArray()]); return { words, expressions, cards, reviews, snapshots } }, [])
  if (!data) return <main className="page"><div className="skeleton tall"/></main>
  const masteredWords = data.cards.filter((c) => c.targetType === 'word' && c.mastered).length; const masteredExpressions = data.cards.filter((c) => c.targetType === 'expression' && c.mastered).length
  return <main className="page stats-page"><header><p className="eyebrow">PROGRESS</p><h1>統計</h1></header><section className="stats-grid"><Metric label="総登録単語" value={data.words}/><Metric label="定着済み" value={masteredWords}/><Metric label="学習中" value={data.words - masteredWords}/><Metric label="登録熟語" value={data.expressions}/><Metric label="定着熟語" value={masteredExpressions}/><Metric label="総復習回数" value={data.reviews}/></section><section className="chart-card"><h2>定着済み単語の推移</h2>{data.snapshots.length ? <div className="line-chart"><Line data={{ labels: data.snapshots.map((s) => s.date.slice(5)), datasets: [{ data: data.snapshots.map((s) => s.masteredWords), borderColor: '#2463a8', backgroundColor: '#2463a8', tension: 0.25 }] }} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }}/></div> : <p className="muted">学習を始めると日ごとの推移が表示されます。</p>}</section></main>
}
function Metric({ label, value }: { label: string; value: number }) { return <article><span>{label}</span><strong>{value}</strong></article> }
