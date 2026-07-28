# 給付金・補助金診断アプリ(スキルアップ・副業向け) MVP

スキルアップ・副業を考えている個人向けに、5つの質問に答えるだけで使えそうな給付金・補助金を診断するWebアプリ。ビルドツール不要のVanilla HTML/CSS/JS。

## ローカルでの動作確認

```
cd subsidy-checker
python -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開く。`index.html` を直接ダブルクリックしても動作する(`js/data.js` にデータを埋め込み済みのため `fetch` は使っていない)。

## ファイル構成

```
subsidy-checker/
├─ index.html          … 診断フォーム+結果表示のSPA本体
├─ css/style.css        … ライト/ダーク対応スタイル(CSS変数)
├─ js/
│   ├─ data.js           … SUBSIDIES配列(data/subsidies.jsonのコピー、グローバル変数として埋め込み)
│   ├─ match.js           … タグベースのスコアリングによるマッチングエンジン(純粋関数、DOM非依存)
│   ├─ quiz.js            … 質問フロー・状態管理・DOM描画
│   └─ render.js          … 結果カードのDOM生成
└─ data/subsidies.json  … データの原本(人間が編集する場所)
```

## データの更新手順

1. `data/subsidies.json` を編集する(スキーマは既存のオブジェクトを参照)。
2. 編集後、`js/data.js` を更新する(`const SUBSIDIES = ` を先頭に付けてJSONをそのまま貼り付けるだけ)。以下のコマンドでも生成できる:
   ```
   printf 'const SUBSIDIES = ' > js/data.js
   cat data/subsidies.json >> js/data.js
   printf ';\n' >> js/data.js
   ```
3. `node --check js/data.js` で構文チェック、下記の動作確認コマンドでマッチングロジックが壊れていないか確認する。

### tagsフィールドの語彙

- `employment_status`: `employee` / `part_time` / `self_employed` / `unemployed_recent` / `student`(空配列は制限なし)
- `purpose`: `skill_up` / `side_job` / `career_change` / `startup`
- `region`: `nationwide` または都道府県コード(例: `tokyo`, `osaka`, `fukuoka`)
- `gender`: `any` または `female` / `male`
- `age_range`: `[最小年齢, 最大年齢]`。制限なしは `[null, null]`
- `requires_employment_insurance`: 雇用保険の加入(通算1年以上等)が要件の制度は `true`

制度情報は手動キュレーションのため、公開前・定期的に一次情報(各省庁・自治体公式サイト)で内容を確認すること。

**2026-07-28に一次情報で裏取り済み、修正した点**:
- 東京都DXリスキリング助成金: 個人事業主・法人代表者本人は受講対象外(受講できるのは雇用する従業員のみ)と判明。`employment_status`から`self_employed`を削除、`conditions_text`を修正。公式URLをR8年度版に更新・403エラーは解消済み。
- 大阪府スキルアップ支援金: 対象者は「国の教育訓練給付金の対象とならない人(雇用保険未加入・加入期間1年未満・離職後1年超等)」であり、会社員一般が広く使える制度ではないと判明。`employment_status`から`employee`を削除、`conditions_text`を修正。
- 小規模事業者持続化補助金<創業型>: 副業の場合は開業届を提出し事業所得として営んでいることが必要(雑所得扱いの副業収入は対象外)と判明。`conditions_text`に追記。
- マナビDX女性向け講座: 受講料支援額は講座ごとに異なることを確認、`benefit_max_yen`を`null`のままとする判断は妥当と確認。

引き続き、公開前には全件を再度一次情報で確認することを推奨する(特に金額・期限は毎年度更新される可能性が高い)。

## マッチングロジックの手動テスト

```
node -e "
const fs = require('fs');
const vm = require('vm');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/data.js','utf8'), ctx);
vm.runInContext(fs.readFileSync('js/match.js','utf8'), ctx);
const answers = {employmentStatus:'employee', employmentInsurance:'yes', ageRange:'25-34', purpose:'skill_up', region:'tokyo', gender:'skip'};
const r = vm.runInContext('matchSubsidies(SUBSIDIES, ' + JSON.stringify(answers) + ')', ctx);
console.log(r.results.map(x => x.name + ' (score=' + x.score + ')').join('\n'));
"
```

## 将来のマネタイズ導線(実装済みの空スロット)

- 各制度の `related_offers` フィールド(現在は空配列)。`{label, url, type}` 形式のオブジェクトを追加すると結果カードにボタンが自動で追加される(`js/render.js` の `buildOfferLinks`)。
- 結果一覧下部の `#ad-slot-result-bottom`(広告プレースホルダ、現在は空)。
- 診断結果画面のメールリード獲得フォーム(`#lead-form`、現在は送信先未設定のダミー)。

## デプロイ

`subsidy-checker/` フォルダをそのままGitHub Pages等の静的ホスティングにpushすれば公開できる(ビルド工程不要)。
