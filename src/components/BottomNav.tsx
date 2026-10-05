import { BarChart3, BookOpen, Home, PlusCircle, Settings } from './Icons'

export type Page = 'home' | 'study' | 'words' | 'stats' | 'settings' | 'add' | 'detail'
export function BottomNav({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  const items = [
    ['home', 'ホーム', Home], ['study', '学習', BookOpen], ['words', '単語', PlusCircle], ['stats', '統計', BarChart3], ['settings', '設定', Settings]
  ] as const
  return <nav className="bottom-nav" aria-label="メインナビゲーション">{items.map(([key, label, Icon]) => <button key={key} className={page === key || (page === 'add' && key === 'words') ? 'active' : ''} onClick={() => onChange(key)} aria-current={page === key ? 'page' : undefined}><Icon aria-hidden="true"/><span>{label}</span></button>)}</nav>
}
