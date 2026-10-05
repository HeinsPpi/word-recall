import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
ChartJS.register(ArcElement, Tooltip, Legend)

export function DonutChart({ initiallyKnown, mastered, learning, rate }: { initiallyKnown: number; mastered: number; learning: number; rate: number | null }) {
  if (rate === null) return <div className="donut-empty" role="img" aria-label="定着率は、ここまで見た単語数を入力すると表示されます"><span>—</span><small>定着率</small></div>
  return <div className="donut-wrap"><Doughnut data={{ labels: ['最初から知っていた', 'アプリで定着', '学習中'], datasets: [{ data: [initiallyKnown, mastered, learning], backgroundColor: ['#aab4c3', '#2463a8', '#d9e3ee'], borderWidth: 0 }] }} options={{ cutout: '76%', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } } }} aria-label={`定着率 ${Math.round(rate * 100)}%`} /><div className="donut-center"><strong>{Math.round(rate * 100)}%</strong><span>定着率</span></div></div>
}
