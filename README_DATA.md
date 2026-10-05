# 辞書データの準備

このリポジトリは、配布許諾を利用者自身が確認・取得する必要がある辞書raw dataを同梱しません。生成AIや架空データで代替もしません。各配布元の最新版の利用条件を確認し、再配布可能な生成物だけを`public/dictionary/`へcommitしてください。

## 自動取得（推奨）

```sh
npm install
npx playwright install chromium
npm run dictionary:download
```

スクリプトはCEFR-JとOctanoveを自動取得し、DiQtの公式ログイン画面をローカルChromiumで開きます。メールアドレスとパスワードはブラウザへご自身で入力してください。スクリプトは認証情報を要求せず、読み取り・保存もしません。ログイン後にターミナルでEnterを押すと、公式ダウンロード画面からA1/A2/B1/B2/PHRASE/PHaVEを取得して所定名で保存します。

Kaikki English JSONLは展開後約3.1GBですが、取得スクリプトはサーバーのgzipレスポンスを展開せず`kaikki.jsonl.gz`（約500MB）として保存します。Pythonもgzipを1行ずつ直接読み、3.1GB版を別途生成しません。取得前の確認を省略する場合は`npm run dictionary:download -- --yes-kaikki`、既にKaikkiを手元に置いた場合やCSVだけ取得する場合は`--skip-kaikki --download-only`を使えます。`--force`は既存ファイルを再取得します。取得完了後は通常、辞書buildとvalidationまで自動実行されます。

## 入手先と配置

`data/raw/`へ次の名前で配置します。

```text
cefrj.csv
octanove_c1c2.csv
diqt_a1.csv
diqt_a2.csv
diqt_b1.csv
diqt_b2.csv
diqt_phrase.csv
diqt_phave.csv
kaikki.jsonl          # kaikki*.jsonl.gz も可
```

- CEFR-J Vocabulary Profile: [CEFR-J公式resources](https://corpuscobo.net/)。研究・商用利用は無償ですが、適切な引用が必要です。著作権は東京外国語大学投野研究室に帰属します。
- Octanove Vocabulary Profile C1/C2: [Open Language Profiles](https://github.com/openlanguageprofiles/olp-en-cefrj)。CC BY-SA 4.0です。
- DiQtのCEFR-J [A1](https://www.diqt.net/ja/word_tags/7/download)・[A2](https://www.diqt.net/ja/word_tags/8/download)・[B1](https://www.diqt.net/ja/word_tags/9/download)・[B2](https://www.diqt.net/ja/word_tags/10/download)、[PHRASE](https://www.diqt.net/ja/word_tags/5/download)、[PHaVE](https://www.diqt.net/ja/word_tags/6/download): 公式CSVはログイン後に取得できます。各ページ記載のCC BY-SA 4.0、CEFR-JおよびDiQtへのクレジット条件を守ってください。本プロジェクトは認証情報も取得済みraw dataも再配布しません。
- English Wiktionary / Kaikki: [Kaikki raw downloads](https://kaikki.org/dictionary/rawdata.html)からEnglish JSONLを取得します。本文データはWiktionaryのCC BY-SA/GFDL条件と帰属要件に従ってください。Wiktextractコード自体はMITです。

配布filenameや列名が異なる場合は`data/raw/source_config.json`で対応できます。

```json
{
  "downloaded-name.csv": {
    "lemma": "actual headword column",
    "cefr": "actual level column",
    "meaning": "actual Japanese column",
    "example": "actual example column"
  }
}
```

利用可能なlogical keyは`lemma`, `cefr`, `pos`, `meaning`, `definition`, `example`, `example_ja`, `ipa`, `target_surface`です。存在しない列は生成・推測されません。

## Buildとvalidation

```sh
python3 scripts/build_dictionary.py
python3 scripts/validate_dictionary.py
```

生成先は`public/dictionary/`、reportは`data_build_report.json`です。validatorは空lemma、不正CEFR、空source、duplicate ID/normalized lemma/expression、orphan、foreign key、空meaning、HTML、制御Unicode、異常長、target不存在、relation、manifest件数、各shard checksumを検査します。問題を自動修正しません。

正常終了後は巨大な`data/raw/kaikki*.jsonl`または`.gz`を削除してもPWAは動作します。raw Kaikkiは`.gitignore`対象です。生成した辞書を公開する前に、全ソースの帰属・ShareAlike・再配布条件を改めて確認してください。
