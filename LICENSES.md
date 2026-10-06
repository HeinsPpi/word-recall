# Licenses

## Application source

WordRecallのアプリケーションコードはMIT Licenseです。全文は`LICENSE`にあります。

## Dictionary data

辞書データはアプリケーションコードとは別の著作物です。

| Source | Terms / attribution |
|---|---|
| CEFR-J Vocabulary Profile | 研究・商用利用は無償、適切な引用が必要。Copyright: Tono Laboratory, Tokyo University of Foreign Studies. 取得物のREADMEを優先。 |
| Octanove Vocabulary Profile C1/C2 | Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), Octanove Labs. |
| DiQt datasets | 配布元・取得物に付属するライセンスを優先。本リポジトリにはraw dataを同梱しない。 |
| PHRASE List | Martinez & Schmitt (2012)を引用し、取得元の再配布条件を優先。本リポジトリにはraw dataを同梱しない。 |
| PHaVE List | Garnier & Schmitt (2015)を引用し、取得元の再配布条件を優先。本リポジトリにはraw dataを同梱しない。 |
| English Wiktionary text | CC BY-SA 4.0 and GNU Free Documentation License 1.3; attribution/share-alike requirements apply. |
| Kaikki / Wiktextract software | Wiktextract is MIT licensed. Extracted entry content retains Wiktionary content licensing. |

生成辞書を第三者へ配布する人が、その時点の原配布元の条件を確認し、必要な著者名、URL、変更表示、同一ライセンスを付す責任を負います。不明なDiQt/PHRASE/PHaVEデータを本番成果物へ自動混入しない設計です。

## JavaScript dependencies

`react`, `react-dom`, `vite`, `vite-plugin-pwa`, `dexie`, `dexie-react-hooks`, `@supabase/supabase-js`, `ts-fsrs`, `chart.js`, `react-chartjs-2`, `lucide-react`, Vitest, Testing Library, Playwright, TypeScript, ESLintおよびPrettierは、それぞれのnpm packageに含まれるlicenseに従います。配布時の正確なversionは`package-lock.json`が唯一の基準です。主要packageはMIT、ISCまたはApache-2.0等のpermissive licenseですが、transitive dependencyを含む全文は`node_modules/<package>/LICENSE*`で確認できます。
