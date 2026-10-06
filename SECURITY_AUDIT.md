# Supabase Security Audit

監査日: 2026-10-06

## 対象構成

- React / TypeScript / Vite PWA。学習データの正本は端末内のDexie / IndexedDB。
- SupabaseはAuthと端末間同期だけに使用。辞書データ、Analytics、位置情報、User-Agentは送信しない。
- Remote schemaは`public.sync_records`の1テーブル。Realtime、Storage、Edge Functions、独自RPCはアプリから使用していない。
- GitHub Pagesで静的配信。Supabase Data APIへpublishable keyとユーザーJWTで接続する。

## 修正前の所見

### Critical

なし。frontend bundle、tracked file、全既存Git履歴にsecret key、service role JWT、DB password、Management API tokenは検出されなかった。旧legacy API keysは無効化済み。

### High

なし。`sync_records`はRLSが有効で、`anon`権限がrevokeされ、CRUD全操作に`auth.uid() = user_id`のpolicyがある。

### Medium

1. `sync_records`のID長、payloadサイズ、行数にDB側上限がなく、認証済みユーザーによるquota枯渇余地がある。
2. パスワードsignup/reset UIと、サーバー側の6文字password・再認証なし設定が不要な攻撃面になっている。
3. CSPがなく、localStorageに保存されるSupabase sessionに対するXSS防御層が不足している。
4. GitHub Actionsのbuild jobにもPages write / OIDC権限があり、checkout credentialが残る。
5. logout後も前ユーザーのIndexedDBデータが同じDB名で表示され、別ユーザーへのlocal data isolationが不十分。

### Low

1. production Auth redirect allowlistにlocalhost wildcardが含まれる。
2. backup importにファイルサイズ・件数・文字列長上限がない。
3. package.jsonに`latest`指定が多い。lockfileは存在し、`npm audit`は0件。
4. raw辞書取得物の既知checksum pinningはない。ただし生成物はSHA-256検証され、React text renderingを使用する。

### Info

- 未知のSupabase error messageを画面へ表示する経路がある。
- CIにdependency audit、secret scan、RLS security testがない。
- `dangerouslySetInnerHTML`、`innerHTML`、`eval`、`new Function`、外部runtime scriptは検出されなかった。
- Service Workerはapp shellのみprecacheし、dictionaryとSupabase API responseのruntime cacheを構成していない。
- backup対象は学習データ6テーブルだけで、session、JWT、API key、OTPを含まない。

## 主な問題と修正

### [Medium] 認証済みユーザーの同期quota枯渇

**場所** `supabase/migrations/20261006090000_create_sync_records.sql`, `src/services/syncService.ts`

**問題・根拠** 修正前はrecord ID、JSON payload、行数にDB側上限がなく、入力時刻と端末IDもclientを信用していた。

**攻撃・障害シナリオと影響** 取得されたsessionまたはsignup可能なアカウントから巨大recordを反復送信すると、DB quotaと同期性能を消費できた。

**修正方法・結果** `20261006100000_harden_sync_records.sql`で1record 256KiB、ID/文字列長、型、10万record上限、server timestamp、uniquenessを追加。不要な`device_id`を削除し、ReviewLogの入力回答・正答・response timeも送信しない。

**確信度** High

### [Medium] 不要なpassword/signup攻撃面

**場所** `src/components/AccountSection.tsx`, Supabase Auth設定

**問題・根拠** password signup/login/reset UIがあり、remoteは最小6文字passwordだった。監査時のAuth user数は0。

**攻撃・障害シナリオと影響** 弱いpasswordや公開signupがaccount/DB quota abuseの入口になる。

**修正方法・結果** iOSではSafariとホーム画面PWAのsession storageが分離されるため、メールリンクを通常フローから削除した。以前に本人確認済みのメールhashと128-bit相当の一回限り登録コードをBefore User Created Hookで照合し、ホーム画面PWA内で12文字以上のpassword signupを完了する。コードは登録後に失効・metadataから削除され、他メールのsignupはDB側で拒否される。

**確信度** High

### [Medium] logout後のローカル他ユーザー漏洩

**場所** `src/components/AccountSection.tsx`, `src/db/userDb.ts`

**問題・根拠** 修正前はsignOut後も共通`WordRecallUserDB`の学習データを表示した。

**攻撃・障害シナリオと影響** 共有PCで次のログイン者が前利用者の単語・メモ・履歴を閲覧できた。

**修正方法・結果** logoutをオンライン同期必須にし、同期成功後に学習DBとsync metadataをtransactionで消去してからsignOutする。辞書DBは保持する。

**確信度** High

### [Medium] CSP不足と広いCI権限

**場所** `index.html`, `.github/workflows/deploy.yml`

**問題・根拠** CSPがなく、全jobへPages write/OIDC権限が付与され、checkout credentialも残っていた。

**攻撃・障害シナリオと影響** XSS成立時のsession窃取や、build step侵害時のdeploy権限悪用の影響が広かった。

**修正方法・結果** meta CSPをself+対象Supabase endpointへ限定し、`unsafe-inline`/`unsafe-eval`/外部scriptを不許可。workflow permissionをjob別へ分離、checkout credentialを無効化、全Actionをcommit SHA固定、`npm audit`を追加。

**確信度** High

### [Low] backup import resource exhaustion

**場所** `src/pages/SettingsPage.tsx`, `src/services/backupService.ts`

**問題・根拠** 任意サイズJSONを先にparseし、配列件数や主要文字列長の上限がなかった。

**攻撃・障害シナリオと影響** 悪意あるbackupを選択するとmemory消費やIndexedDB肥大化が起き得た。

**修正方法・結果** parse前10MiB上限、各配列10万件上限、単語・memo・設定値の範囲検証を追加。全検証成功前に既存DBは変更しない挙動を維持した。

**確信度** High

## 残存リスク

- Supabase sessionはPWAの性質上JavaScriptからアクセス可能であり、XSS対策が主要防御となる。
- GitHub Pagesは任意HTTP response headerを設定できないため、CSPはmetaで設定し、`frame-ancestors`等は設定できない。
- 独自E2EEは導入しない。通信はHTTPS/TLS、クラウド側保護はSupabaseへ依存する。
- Supabase Auth、GitHub、npm registryという外部サービスの可用性・サプライチェーンリスクは残る。

## 修正結果

- DB: RLS `ENABLE` + `FORCE`。SELECT/INSERT/UPDATE/DELETEの4 policyを確認。INSERT/UPDATEは`WITH CHECK`あり。
- Grants: `anon`は全操作不可。`authenticated`はSELECT/INSERT/UPDATE/DELETEだけ。TRUNCATE/REFERENCES/TRIGGERなし。
- Cross-user/anonymous test: pgTAP 18/18成功。本番transaction内で実行しrollback済み。
- Public objects: table 1、SECURITY INVOKER trigger function 1、view/RPC 0、Storage bucket 0、Realtime publication table 0。登録制限用objectはData API非公開の`private` schemaに隔離。
- Security Advisor: 修正後ERROR/WARN 0件。
- Secret: tracked file、全既存Git履歴、production bundleに有効secretなし。frontend keyはpublishable keyのみ。
- Dependency: `npm audit` Critical/High/Medium/Lowすべて0。package specifierを実install versionへ固定。
- XSS: unsafe DOM API、eval、dynamic runtime scriptなし。React text renderingを使用。
- Service Worker: Supabase API/Auth responseのruntime cacheなし。
- Quality gates: `npm ci`、lint、typecheck、production build成功。Vitest 35/35、Playwright 3 passed / 1 intentional skip（WebKit UI full-flow成功、WebKit offline emulationのみ非対応）、辞書91.2MB。

## チェック結果

| 項目 | 状態 | コメント |
|---|---|---|
| Injection | ✅ | SQL文字列生成/RPCなし。Data API利用、DB制約追加 |
| XSS | ✅ | unsafe DOM APIなし、React text rendering、CSPあり |
| CSRF | ✅ | Cookie認証APIではなくBearer JWT/Data API。state-changing RESTはRLSで保護 |
| 認証 | ✅ | 匿名無効、email hash＋一回限りコードでsignup制限、12文字以上のpassword |
| 認可 | ✅ | FORCE RLS、owner CRUD、cross-user 18/18 test |
| 入力Validation | ✅ | DB payload/ID/文字数/件数制約、backup上限 |
| Secret管理 | ✅ | frontendはpublishable keyのみ、履歴/bundle scan 0 |
| Dependencies | ✅ | lockfile・完全version固定、`npm audit` 0 |
| API Security | ✅ | 単一Data API table、anon不可、不要RPCなし |
| Database | ✅ | table 1、RLS/最小GRANT/FK/unique/server timestamp |
| File Upload | ✅ | backup JSONのみ、10MiB上限、schema全検証後にrestore |
| AI / Prompt Injection | ✅ | runtime AI/agent/tool callingなし |
| AI Agent設定 | 未確認 | repository内に専用auto-approve設定なし。端末全体設定は監査対象外 |
| CI/CD | ✅ | job最小権限、Action SHA pin、audit、credential非保持 |
| Logging | ✅ | token/OTP/error詳細のconsole・telemetryなし |
| Deployment | ⚠️ | HTTPS/CSPあり。GitHub Pages制約でheader型防御は未設定 |

## 手動作業と残存判定

初回登録コードはrepositoryやfrontend bundleへ保存しない。private DBにはhashだけを保持し、登録完了後に自動失効する。操作手順は`README_SECURITY.md`に記載した。

総合評価は **B**。Critical 0 / High 0 / Medium 4（修正済み）/ Low 1（修正済み）/ Info 4。
