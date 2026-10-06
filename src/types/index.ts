export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type SourceStatus =
  'confirmed' | 'supported' | 'singleSource' | 'userProvided'
export type SourceName =
  | 'CEFR-J'
  | 'Octanove'
  | 'DiQt'
  | 'EJDict'
  | 'Japanese WordNet'
  | 'FreeDict'
  | 'JMdict'
  | 'Japanese Wiktionary'
  | 'PHRASE'
  | 'PHaVE'
  | 'Wiktionary'
  | 'user'

export interface DictionaryWord {
  id: string
  lemma: string
  normalizedLemma: string
  pos: string[]
  cefrLevel: CefrLevel | null
  cefrSource: SourceName | null
  sourceCount: number
  sourceStatus: Exclude<SourceStatus, 'userProvided'>
  sources: SourceName[]
  conflicts?: string[]
}
export interface Meaning {
  id: string
  wordId: string
  language: string
  text: string
  source: SourceName
}
export interface Definition {
  id: string
  wordId: string
  text: string
  source: SourceName
}
export interface Pronunciation {
  id: string
  wordId: string
  ipa: string
  source: SourceName
}
export interface WordForm {
  id: string
  wordId: string
  form: string
  normalizedForm: string
  formType: string
  source: SourceName
}
export interface Example {
  id: string
  wordId: string
  sentence: string
  translationJa: string | null
  targetSurface: string | null
  source: SourceName
}
export interface DictionaryExpression {
  id: string
  text: string
  normalizedText: string
  cefrLevel: CefrLevel | null
  inPhraseList: boolean
  inPhaveList: boolean
  sourceCount: number
  sourceStatus: Exclude<SourceStatus, 'userProvided'>
  sources: SourceName[]
}
export interface ExpressionWord {
  id: string
  expressionId: string
  wordId: string
}
export interface ExpressionMeaning {
  id: string
  expressionId: string
  language: string
  text: string
  source: SourceName
}
export interface ExpressionExample {
  id: string
  expressionId: string
  sentence: string
  translationJa: string | null
  targetSurface: string | null
  source: SourceName
}
export interface WiktionaryExistence {
  normalizedLemma: string
  lemma: string
  pos: string
}

export interface UserWord {
  id: string
  dictionaryWordId: string | null
  lemma: string
  normalizedLemma: string
  addedAt: string
  customMeaningJa: string | null
  customDefinitionEn: string | null
  customExample: string | null
  customMemo: string | null
  sourceStatus: SourceStatus
  isActive: boolean
}
export interface UserExpression {
  id: string
  expressionId: string
  parentUserWordId: string | null
  enabled: boolean
  addedAt: string
}
export interface StudyCard {
  id: string
  targetType: 'word' | 'expression'
  targetId: string
  fsrsCardData: FsrsCardRecord
  createdAt: string
  lastReviewedAt: string | null
  mastered: boolean
  introductionSeen: boolean
  promptCursor: number
}
export interface FsrsCardRecord {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}
export interface ReviewLog {
  id: string
  cardId: string
  reviewedAt: string
  rating: 1 | 2 | 3 | 4
  promptType: PromptType
  userAnswer: string
  expectedAnswer: string
  usedHint: boolean
  wasTypo: boolean
  responseTimeMs: number
}
export interface AppSettings {
  id: 'settings'
  totalEncounteredWords: number | null
  desiredRetention: number
  masteryStabilityDays: number
  dictionaryVersion: string | null
  lastBackupAt: string | null
}
export interface ProgressSnapshot {
  id: string
  date: string
  registeredWords: number
  masteredWords: number
  registeredExpressions: number
  masteredExpressions: number
  totalReviews: number
}
export type SyncTableName =
  | 'userWords'
  | 'userExpressions'
  | 'studyCards'
  | 'reviewLogs'
  | 'appSettings'
  | 'progressSnapshots'
export interface SyncMeta {
  id: string
  userId: string
  tableName: SyncTableName
  recordId: string
  localHash: string
  remoteUpdatedAt: string
}
export interface SyncState {
  id: 'sync'
  lastSyncedAt: string | null
  userId?: string
}
export type PromptType =
  'definition' | 'exampleCloze' | 'expressionCloze' | 'japaneseFallback'
export interface StudyPrompt {
  type: PromptType
  prompt: string
  answer: string
  meaning: string | null
  definition: string | null
}

export interface ManifestShard {
  path: string
  table: DictionaryTable
  count: number
  bytes: number
  sha256: string
  encoding?: 'existence-tuple-v1'
}
export type DictionaryTable =
  | 'words'
  | 'meanings'
  | 'definitions'
  | 'pronunciations'
  | 'wordForms'
  | 'examples'
  | 'expressions'
  | 'expressionWords'
  | 'expressionMeanings'
  | 'expressionExamples'
  | 'wiktionaryExistence'
export interface DictionaryManifest {
  schemaVersion: 1
  dictionaryVersion: string
  buildDate: string
  wordCount: number
  expressionCount: number
  existenceIndexCount: number
  exampleCount: number
  totalBytes: number
  shards: ManifestShard[]
}

export interface BackupFile {
  app: 'WordRecall'
  schemaVersion: 1
  exportedAt: string
  dictionaryVersion: string | null
  data: {
    userWords: UserWord[]
    userExpressions: UserExpression[]
    studyCards: StudyCard[]
    reviewLogs: ReviewLog[]
    appSettings: AppSettings[]
    progressSnapshots: ProgressSnapshot[]
  }
}
