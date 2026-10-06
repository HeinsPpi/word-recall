import type { Session } from '@supabase/supabase-js'
import { userDb } from '../db/userDb'
import type {
  AppSettings,
  ProgressSnapshot,
  ReviewLog,
  StudyCard,
  SyncMeta,
  SyncTableName,
  UserExpression,
  UserWord
} from '../types'
import { supabase } from './supabaseClient'

const tableNames: SyncTableName[] = [
  'userWords',
  'userExpressions',
  'studyCards',
  'reviewLogs',
  'appSettings',
  'progressSnapshots'
]
type SyncPayload =
  | UserWord
  | UserExpression
  | StudyCard
  | ReviewLog
  | AppSettings
  | ProgressSnapshot
interface RemoteRecord {
  user_id: string
  table_name: SyncTableName
  record_id: string
  payload: unknown
  updated_at: string
  deleted_at: string | null
  device_id: string
}
export interface SyncStatus {
  state: 'idle' | 'syncing' | 'success' | 'error'
  lastSyncedAt: string | null
  message?: string
}

let active: Promise<void> | null = null
let timer: number | null = null
let listenersInstalled = false

function emit(status: SyncStatus): void {
  window.dispatchEvent(
    new CustomEvent<SyncStatus>('wordrecall-sync', { detail: status })
  )
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hash(value: unknown): string {
  const text = stable(value)
  let result = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}

function validPayload(
  table: SyncTableName,
  payload: unknown
): payload is SyncPayload {
  if (!payload || typeof payload !== 'object') return false
  const item = payload as Record<string, unknown>
  if (typeof item.id !== 'string') return false
  if (table === 'userWords')
    return (
      typeof item.lemma === 'string' &&
      typeof item.normalizedLemma === 'string' &&
      typeof item.isActive === 'boolean'
    )
  if (table === 'userExpressions')
    return (
      typeof item.expressionId === 'string' && typeof item.enabled === 'boolean'
    )
  if (table === 'studyCards')
    return (
      (item.targetType === 'word' || item.targetType === 'expression') &&
      typeof item.targetId === 'string' &&
      Boolean(item.fsrsCardData)
    )
  if (table === 'reviewLogs')
    return (
      typeof item.cardId === 'string' && typeof item.reviewedAt === 'string'
    )
  if (table === 'appSettings')
    return item.id === 'settings' && typeof item.desiredRetention === 'number'
  return (
    typeof item.date === 'string' && typeof item.registeredWords === 'number'
  )
}

async function localRows(table: SyncTableName): Promise<SyncPayload[]> {
  switch (table) {
    case 'userWords':
      return userDb.userWords.toArray()
    case 'userExpressions':
      return userDb.userExpressions.toArray()
    case 'studyCards':
      return userDb.studyCards.toArray()
    case 'reviewLogs':
      return userDb.reviewLogs.toArray()
    case 'appSettings':
      return userDb.appSettings.toArray()
    case 'progressSnapshots':
      return userDb.progressSnapshots.toArray()
  }
}

async function putLocal(
  table: SyncTableName,
  payload: SyncPayload
): Promise<void> {
  switch (table) {
    case 'userWords':
      await userDb.userWords.put(payload as UserWord)
      break
    case 'userExpressions':
      await userDb.userExpressions.put(payload as UserExpression)
      break
    case 'studyCards':
      await userDb.studyCards.put(payload as StudyCard)
      break
    case 'reviewLogs':
      await userDb.reviewLogs.put(payload as ReviewLog)
      break
    case 'appSettings':
      await userDb.appSettings.put(payload as AppSettings)
      break
    case 'progressSnapshots':
      await userDb.progressSnapshots.put(payload as ProgressSnapshot)
      break
  }
}

async function deleteLocal(table: SyncTableName, id: string): Promise<void> {
  switch (table) {
    case 'userWords':
      await userDb.userWords.delete(id)
      break
    case 'userExpressions':
      await userDb.userExpressions.delete(id)
      break
    case 'studyCards':
      await userDb.studyCards.delete(id)
      break
    case 'reviewLogs':
      await userDb.reviewLogs.delete(id)
      break
    case 'appSettings':
      if (id === 'settings') await userDb.appSettings.delete(id)
      break
    case 'progressSnapshots':
      await userDb.progressSnapshots.delete(id)
      break
  }
}

async function fetchRemote(userId: string): Promise<RemoteRecord[]> {
  if (!supabase) return []
  const rows: RemoteRecord[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('sync_records')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at')
      .range(from, from + 999)
    if (error) throw error
    const page = (data ?? []) as RemoteRecord[]
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

async function getDeviceId(userId: string): Promise<string> {
  const current = await userDb.syncState.get('sync')
  if (current?.userId && current.userId !== userId)
    throw new Error(
      'この端末の学習データは別のアカウントに関連付けられています。先にバックアップを作成してください。'
    )
  if (current) {
    if (!current.userId) await userDb.syncState.put({ ...current, userId })
    return current.deviceId
  }
  const deviceId = crypto.randomUUID()
  await userDb.syncState.put({ id: 'sync', deviceId, lastSyncedAt: null, userId })
  return deviceId
}

async function syncNow(session: Session): Promise<void> {
  if (!supabase || !navigator.onLine) return
  emit({
    state: 'syncing',
    lastSyncedAt: (await userDb.syncState.get('sync'))?.lastSyncedAt ?? null
  })
  const userId = session.user.id
  const deviceId = await getDeviceId(userId)
  const [remoteRows, metaRows, ...locals] = await Promise.all([
    fetchRemote(userId),
    userDb.syncMeta.where('userId').equals(userId).toArray(),
    ...tableNames.map(localRows)
  ])
  const remote = new Map(
    remoteRows.map((row) => [`${row.table_name}:${row.record_id}`, row])
  )
  const meta = new Map(
    (metaRows as SyncMeta[]).map((row) => [
      `${row.tableName}:${row.recordId}`,
      row
    ])
  )
  const uploads: RemoteRecord[] = []
  const nextMeta: SyncMeta[] = []
  const now = new Date().toISOString()

  for (let tableIndex = 0; tableIndex < tableNames.length; tableIndex += 1) {
    const table = tableNames[tableIndex]
    const rows = locals[tableIndex] as SyncPayload[]
    const local = new Map(rows.map((row) => [row.id, row]))
    for (const row of remoteRows.filter((item) => item.table_name === table)) {
      const key = `${table}:${row.record_id}`
      const localRow = local.get(row.record_id)
      const oldMeta = meta.get(key)
      if (row.deleted_at) {
        if (!localRow || (oldMeta && hash(localRow) === oldMeta.localHash))
          await deleteLocal(table, row.record_id)
        local.delete(row.record_id)
        continue
      }
      if (!localRow && oldMeta) {
        uploads.push({ ...row, updated_at: now, deleted_at: now, device_id: deviceId })
        nextMeta.push({
          id: `${userId}:${key}`,
          userId,
          tableName: table,
          recordId: row.record_id,
          localHash: '__deleted__',
          remoteUpdatedAt: now
        })
        continue
      }
      if (!validPayload(table, row.payload) || row.payload.id !== row.record_id)
        continue
      if (
        !localRow ||
        (!oldMeta && table === 'appSettings') ||
        (oldMeta &&
          hash(localRow) === oldMeta.localHash &&
          row.updated_at > oldMeta.remoteUpdatedAt)
      ) {
        try {
          await putLocal(table, row.payload)
          local.set(row.record_id, row.payload)
        } catch (error) {
          if (!(
            error instanceof DOMException && error.name === 'ConstraintError'
          ))
            throw error
        }
      }
    }
    for (const row of local.values()) {
      const key = `${table}:${row.id}`
      const remoteRow = remote.get(key)
      const oldMeta = meta.get(key)
      const localHash = hash(row)
      const remoteChanged = Boolean(
        remoteRow && oldMeta && remoteRow.updated_at > oldMeta.remoteUpdatedAt
      )
      const localChanged = !oldMeta || oldMeta.localHash !== localHash
      if (
        !remoteRow ||
        (localChanged && !remoteChanged) ||
        (localChanged && remoteChanged)
      ) {
        uploads.push({
          user_id: userId,
          table_name: table,
          record_id: row.id,
          payload: row,
          updated_at: now,
          deleted_at: null,
          device_id: deviceId
        })
        nextMeta.push({
          id: `${userId}:${key}`,
          userId,
          tableName: table,
          recordId: row.id,
          localHash,
          remoteUpdatedAt: now
        })
      } else {
        nextMeta.push({
          id: `${userId}:${key}`,
          userId,
          tableName: table,
          recordId: row.id,
          localHash,
          remoteUpdatedAt: remoteRow.updated_at
        })
      }
    }
  }

  for (let index = 0; index < uploads.length; index += 200) {
    const { error } = await supabase
      .from('sync_records')
      .upsert(uploads.slice(index, index + 200), {
        onConflict: 'user_id,table_name,record_id'
      })
    if (error) throw error
  }
  await userDb.transaction(
    'rw',
    [userDb.syncMeta, userDb.syncState],
    async () => {
      await userDb.syncMeta.bulkPut(nextMeta)
      await userDb.syncState.put({ id: 'sync', deviceId, lastSyncedAt: now, userId })
    }
  )
  emit({ state: 'success', lastSyncedAt: now })
}

export async function synchronize(): Promise<void> {
  if (active) return active
  active = (async () => {
    if (!supabase) return
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (data.session) await syncNow(data.session)
  })()
    .catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : '同期に失敗しました'
      emit({ state: 'error', lastSyncedAt: null, message })
      throw error
    })
    .finally(() => {
      active = null
    })
  return active
}

export function requestSync(delayMs = 800): void {
  if (!supabase || !navigator.onLine) return
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = null
    void synchronize().catch(() => undefined)
  }, delayMs)
}

export function initializeSync(): () => void {
  if (!supabase || listenersInstalled) return () => undefined
  listenersInstalled = true
  const onOnline = () => requestSync(0)
  const onVisible = () => {
    if (document.visibilityState === 'visible') requestSync(0)
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED'
    )
      requestSync(0)
  })
  requestSync(0)
  return () => {
    listenersInstalled = false
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    data.subscription.unsubscribe()
  }
}
