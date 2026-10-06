# WordRecall security operations

WordRecallは端末内IndexedDBを正本とし、Supabaseはパスワードレス認証と学習データ同期だけに使います。辞書、入力した回答文字列、応答時間、端末ID、Analyticsはクラウドへ送りません。

## iPhoneでの初回登録

Safariとホーム画面PWAは認証storageが分かれるため、メールリンク認証は使用しません。初回登録もログインもホーム画面PWA内だけで完了します。

1. ホーム画面PWAの「設定」→「アカウントと同期」を開く。
2. 自分のメールアドレス、12文字以上の同期用パスワード、管理者から受け取った一回限り登録コードを入力する。
3. 「初回アカウントを作成」を押す。その場でログインと同期が始まる。
4. PCなど2台目以降は、同じメールアドレスとパスワードで「ログインして同期」を押す。登録コードは不要。

Supabase標準メールproviderの2通/時制限には依存しません。signup endpoint自体は初回登録のため有効ですが、Before User Created Hookが、以前に本人確認されたメールのSHA-256と一回限り登録コードのSHA-256の両方を照合します。それ以外のsignupはDB側で拒否されます。登録成功時にコードは失効し、Auth metadataからも削除されます。

## Dashboardで確認する項目

- **Authentication → Sign In / Providers → Email → Allow new users to sign up**: ON。個人用allowlist Auth Hookが必須。HookなしでONにしない。
- **Authentication → Hooks → Before User Created**: `private.wordrecall_before_user_created`を有効化。
- **Authentication → General Configuration → Allow anonymous sign-ins**: OFF。監査時にOFFを確認済み。
- **Authentication → URL Configuration → Site URL**: `https://heinsppi.github.io/word-recall/`。
- **Authentication → URL Configuration → Redirect URLs**: `https://heinsppi.github.io/word-recall/**`だけ。localhostと任意ドメインwildcardは残さない。
- **Authentication → Rate Limits**: Email送信制限を無効化しない。監査時は2通/時。
- **Database → Security Advisor**: migration適用後にERROR/WARNが0件であることを確認する。
- **Database → Publications**: `supabase_realtime`へ`sync_records`を追加しない。
- **Storage**: bucketを作らない。
- **Project Settings → API Keys**: frontendでは`sb_publishable_...`だけを使用する。secret/service-role keyをGitHub Variablesや`VITE_*`へ入れない。
- **Organization / Account Settings**: Supabaseと連携GitHubアカウントのMFAを有効化し、不要なmemberとpersonal access tokenを削除する。

## 再現可能なDB防御

`supabase/migrations`は次を構成します。

- `sync_records`のRLSをENABLEかつFORCE。
- `anon`/`public`は権限なし。`authenticated`はSELECT/INSERT/UPDATE/DELETEだけ。
- CRUDごとに`(select auth.uid()) = user_id`を検証し、INSERT/UPDATEには`WITH CHECK`を設定。
- record/payloadの型・長さ・256KiB上限、ユーザーあたり10万record上限、重複単語・熟語制約。
- `updated_at`とtombstone時刻はDB側で設定。
- trigger functionは`SECURITY INVOKER`、空の`search_path`、直接EXECUTE不可。

RLSテストは`supabase/tests/database/sync_records_rls.test.sql`にあります。Dockerが使える環境では次を実行します。

```sh
npx supabase start
npx supabase test db
```

本番監査では同じSQLをtransaction内で実行してrollbackし、18/18成功を確認しました。

## Keyと環境変数

許可するfrontend環境変数は次の2つだけです。

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

`.env*`は`.gitignore`対象で、値なしの`.env.example`だけをcommitします。publishable keyは公開情報であり、RLSが認可境界です。DB password、service role、`sb_secret_...`、Management API tokenはfrontendに置きません。

監査ではtracked file、Git履歴、`dist`にsecret-shaped valueがないことを確認しました。過去に使用したlegacy API keysはSupabase側で無効化済みです。漏洩した有効secretは検出されていないため、現時点で追加rotationは不要です。

## セッション・端末データ

Supabase SDKの標準session refreshを使用し、tokenをログ・backup・Cache Storageへ入れません。Service WorkerにはSupabase endpointのruntime cacheがありません。logoutはオンライン同期後に学習用IndexedDBを消去してからsessionを破棄するため、同じブラウザで次の利用者へ前利用者のデータを見せません。辞書DBは消去しません。

GitHub Pagesは任意のHTTP security headerを設定できないため、CSPは`index.html`のmetaで設定しています。`frame-ancestors`、`X-Content-Type-Options`などheader限定の防御が必要になった場合は、静的配信先をCloudflare Pages等へ変更してください。
