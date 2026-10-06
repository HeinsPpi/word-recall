import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { BottomNav, type Page } from '../components/BottomNav'
import { dictionaryAvailable, fetchManifest } from '../services/setupService'
import { ensureSettings } from '../db/userDb'
import type { DictionaryManifest } from '../types'
import { SetupPage } from '../pages/SetupPage'
import type { UserWord } from '../types'

const HomePage = lazy(() =>
  import('../pages/HomePage').then((m) => ({ default: m.HomePage }))
)
const AddWordPage = lazy(() =>
  import('../pages/AddWordPage').then((m) => ({ default: m.AddWordPage }))
)
const StudyPage = lazy(() =>
  import('../pages/StudyPage').then((m) => ({ default: m.StudyPage }))
)
const WordsPage = lazy(() =>
  import('../pages/WordsPage').then((m) => ({ default: m.WordsPage }))
)
const StatsPage = lazy(() =>
  import('../pages/StatsPage').then((m) => ({ default: m.StatsPage }))
)
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const WordDetailPage = lazy(() =>
  import('../pages/WordDetailPage').then((m) => ({ default: m.WordDetailPage }))
)

export function App() {
  const [ready, setReady] = useState<boolean | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [selected, setSelected] = useState<UserWord | null>(null)
  const [dictionaryUpdate, setDictionaryUpdate] =
    useState<DictionaryManifest | null>(null)
  const [updatingDictionary, setUpdatingDictionary] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const finishInitialSetup = useCallback(() => setReady(true), [])
  const finishDictionaryUpdate = useCallback(() => {
    setUpdatingDictionary(false)
    setDictionaryUpdate(null)
  }, [])
  const cancelDictionaryUpdate = useCallback(
    () => setUpdatingDictionary(false),
    []
  )
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisterError: () =>
      setRuntimeError(
        'オフライン機能の更新に失敗しました。オンライン時に再読み込みしてください。'
      )
  })
  useEffect(() => {
    void dictionaryAvailable()
      .then(setReady)
      .catch(() => setReady(false))
  }, [])
  useEffect(() => {
    if (!ready) return
    let dispose: () => void = () => undefined
    void import('../services/syncService').then((module) => {
      dispose = module.initializeSync()
    })
    return () => dispose()
  }, [ready])
  useEffect(() => {
    if (!ready || !navigator.onLine) return
    void Promise.all([fetchManifest(), ensureSettings()])
      .then(([manifest, settings]) => {
        if (
          settings.dictionaryVersion &&
          manifest.dictionaryVersion !== settings.dictionaryVersion
        )
          setDictionaryUpdate(manifest)
      })
      .catch(() => undefined)
  }, [ready])
  if (ready === null)
    return (
      <div className="app-loading">
        <div className="spinner" />
      </div>
    )
  if (!ready) return <SetupPage onReady={finishInitialSetup} />
  if (updatingDictionary && dictionaryUpdate)
    return (
      <SetupPage
        mode="update"
        manifest={dictionaryUpdate}
        onReady={finishDictionaryUpdate}
        onCancel={cancelDictionaryUpdate}
      />
    )
  let content
  if (page === 'home') content = <HomePage go={setPage} />
  else if (page === 'add')
    content = <AddWordPage onDone={() => setPage('words')} />
  else if (page === 'study') content = <StudyPage />
  else if (page === 'words')
    content = (
      <WordsPage
        onAdd={() => setPage('add')}
        onSelect={(word) => {
          setSelected(word)
          setPage('detail')
        }}
      />
    )
  else if (page === 'stats') content = <StatsPage />
  else if (page === 'detail' && selected)
    content = (
      <WordDetailPage userWord={selected} onBack={() => setPage('words')} />
    )
  else content = <SettingsPage />
  return (
    <div className="app-shell">
      <Suspense
        fallback={
          <main className="page">
            <div className="skeleton tall" />
          </main>
        }
      >
        {content}
      </Suspense>
      <BottomNav
        page={page}
        onChange={(next) => {
          setPage(next)
          window.scrollTo(0, 0)
        }}
      />
      {runtimeError && (
        <div className="toast" role="alert">
          {runtimeError}
          <button aria-label="閉じる" onClick={() => setRuntimeError(null)}>
            ×
          </button>
        </div>
      )}
      {dictionaryUpdate && (
        <div className="update-banner" role="status">
          <span>辞書の更新があります</span>
          <button onClick={() => setUpdatingDictionary(true)}>
            学習終了後に更新
          </button>
          <button aria-label="閉じる" onClick={() => setDictionaryUpdate(null)}>
            ×
          </button>
        </div>
      )}
      {needRefresh && !dictionaryUpdate && (
        <div className="update-banner" role="status">
          <span>アプリの更新があります</span>
          <button
            onClick={() =>
              void updateServiceWorker(true).catch(() =>
                setRuntimeError('アプリの更新に失敗しました。')
              )
            }
          >
            学習終了後に更新
          </button>
          <button aria-label="閉じる" onClick={() => setNeedRefresh(false)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
