# WordRecall

公開PWA: https://heinsppi.github.io/word-recall/

WordRecallは、既存の単語帳で分からなかった英単語だけを登録し、英語定義・英文クローズ・熟語クローズによるactive recallとFSRSで長期記憶への定着を支えるPWAです。ゲーム的なXPや連続記録はありません。

## 設計

- React + TypeScript + Vite、Dexie/IndexedDB、`ts-fsrs`、Chart.js、Web Speech API、Workbox (`vite-plugin-pwa`)
- 辞書DB (`WordRecallDictionaryDB-*`) と学習DB (`WordRecallUserDB`) を分離。辞書更新に失敗しても以前の辞書と学習履歴を保持します。
- 実行時のAI・LLM・翻訳API・分析・広告トラッキングはありません。任意のSupabaseアカウントで、PCとiPhone間の学習データだけを同期できます。未ログイン時は端末内だけに保存します。
- 同期はoffline-firstです。辞書は同期せず各端末のIndexedDBに保存し、単語・熟語・FSRS状態・復習履歴・設定だけを同期します。Row Level Securityにより本人の行だけを読み書きできます。
- 辞書の各意味、定義、例文、発音、レベルは出典を保持し、複数ソースの文章を勝手に合成しません。
- `ts-fsrs` 5.xを使い、既定の目標記憶率は90%。正解=Good、Hint後または安全な長語の1文字誤り=Hard、不正解=Againです。
- 定着は Stability 30日以上、かつ異なる直近2日でGood以上という条件です。
- Service Workerはapp shellだけをprecacheし、辞書shardは検証後にIndexedDBへ入れます。辞書をCache Storageへ二重保存しません。

実辞書は著作権・配布条件を確認したraw fileからローカル生成します。リポジトリのproduction buildにテストfixtureは入りません。詳細は [README_DATA.md](README_DATA.md) を参照してください。

## ローカル開発

必要なものはNode.js 20.19以上、npm、Python 3です。Xcode、Swift、Apple Developer Programは不要です。

```sh
npm install
npx playwright install chromium
npm run dictionary:download
npm run dev
```

端末間同期を有効にするローカルbuildでは、`.env.example`を参考に`VITE_SUPABASE_URL`とブラウザ公開用の`VITE_SUPABASE_PUBLISHABLE_KEY`を設定します。`service_role`や`sb_secret_`キーをブラウザへ入れてはいけません。DB変更は`supabase/migrations`で管理します。

`dictionary:download`は公開CEFR-J/Octanoveを直接取得し、DiQtのログイン画面をChromiumで開きます。DiQtのメールアドレスとパスワードはブラウザへ本人が直接入力し、スクリプトは認証情報を読み取り・保存しません。ログイン後は公式CSV 6点を取得し、Kaikkiの大容量取得を確認してから、buildとvalidationまで実行します。

辞書raw dataが未配置でもアプリ本体はbuildできますが、build時に明示的なwarningが出て、初回画面は実辞書の生成を案内します。架空データにはfallbackしません。

## 検証

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run preview
```

E2EはChromiumとWebKitで初回setup、検索、登録、熟語選択、初回学習、正誤・Hint、FSRS更新、ホーム集計、backup/restore、offline reloadを確認します。`tests/e2e-public` はE2E専用で、通常のproduction buildには含まれません。

## 辞書構成

`scripts/build_dictionary.py` はCSVを行単位、Kaikki JSONL/JSONL.GZをストリーミング処理します。詳細対象はCEFR-J、Octanove、DiQt、PHRASE、PHaVEのunionです。それ以外のEnglish Wiktionary項目は軽量存在indexだけを生成します。全テーブルはnormalized keyのSHA-256先頭2桁で固定分割され、manifestには件数・bytes・SHA-256が入ります。

生成後の `data_build_report.json` にはソース別件数、重複、競合、無効行、最終容量、shard数が記録されます。150MBを超えるとテーブル別容量とwarningを表示します。

## GitHub Pages

`main`へのpushでGitHub Actionsがinstall、lint、typecheck、unit test、build、Pages deployを実行します。Repository Variablesの`VITE_SUPABASE_URL`と`VITE_SUPABASE_PUBLISHABLE_KEY`が同期設定としてbuildへ渡されます。Viteの`base`は`GITHUB_REPOSITORY`からリポジトリ名を自動取得するため、`https://USERNAME.github.io/word-recall/`のような配下でも動作します。画面routingはclient stateなのでSPA 404は発生しません。

iPhoneへの導入は [README_IPHONE.md](README_IPHONE.md)、Supabaseの初回セキュリティ設定は [README_SECURITY.md](README_SECURITY.md)、第三者データとライブラリは [LICENSES.md](LICENSES.md) と [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を確認してください。
