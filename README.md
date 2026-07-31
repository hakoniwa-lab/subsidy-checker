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
├─ .nojekyll             … GitHub PagesのJekyll処理を無効化(空ファイル)
├─ robots.txt            … sitemap.xmlの場所を記載(生成)
├─ sitemap.xml           … 全ページのURL一覧(生成)
├─ css/style.css        … ライト/ダーク対応スタイル(CSS変数)
├─ js/
│   ├─ data.js           … SUBSIDIES配列(data/subsidies.jsonのコピー、グローバル変数として埋め込み)
│   ├─ regions.js         … 都道府県コード⇔ラベル変換表(ブラウザ/Node両対応)
│   ├─ match.js           … タグベースのスコアリングによるマッチングエンジン(純粋関数、DOM非依存)
│   ├─ quiz.js            … 質問フロー・状態管理・DOM描画
│   └─ render.js          … 結果カードのDOM生成(詳細ページへのリンク含む)
├─ data/subsidies.json  … データの原本(人間が編集する場所)
├─ scripts/
│   └─ generate-seo-pages.js … SEO用の制度別静的ページ・一覧・sitemap.xml・robots.txtを生成するスクリプト
└─ seido/                … 生成されるSEOページ(制度ごとの個別ページ+一覧ページ)
    ├─ index.html          … 制度一覧(カテゴリ別)
    └─ {id}/index.html     … 制度ごとの詳細ページ(125件)
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
4. SEO用の個別ページ・一覧・sitemap.xml・robots.txtを再生成する:
   ```
   node scripts/generate-seo-pages.js
   ```
   このコマンドは`seido/`フォルダを一度削除してから作り直すため、`id`を変更・削除した制度がある場合は古いURLのページが自動的に消える(以後404になる)。運用上`id`は変更しないことを推奨。新しい`category`を追加した場合は`scripts/generate-seo-pages.js`内の`CATEGORY_KEYWORDS`にも追加しないとスクリプトがエラーで停止する(未登録カテゴリが一覧ページから漏れるのを防ぐための安全策)。
5. `node --check scripts/generate-seo-pages.js`で構文チェック、`git status`で`seido/`配下の追加・削除件数が想定通りか確認してからコミットする。

### tagsフィールドの語彙

- `employment_status`: `employee` / `part_time` / `self_employed` / `unemployed_recent` / `student`(空配列は制限なし)
- `purpose`: `skill_up` / `side_job` / `career_change` / `startup` / `family_support`(子育て) / `housing`(住宅) / `medical`(医療費)(2026-07-31追加)
- `region`: `nationwide` または都道府県コード(例: `tokyo`, `osaka`, `fukuoka`)
- `gender`: `any` または `female` / `male`
- `age_range`: `[最小年齢, 最大年齢]`。制限なしは `[null, null]`
- `requires_employment_insurance`: 雇用保険の加入(通算1年以上等)が要件の制度は `true`

制度情報は手動キュレーションのため、公開前・定期的に一次情報(各省庁・自治体公式サイト)で内容を確認すること。

**2026-07-31、「子育て」「住宅」「医療費」ジャンルを全国レベルで追加(125件→143件)**: `purpose`の選択肢に`family_support`/`housing`/`medical`を追加し、それぞれ全国共通で使える主要制度を計18件追加した(子育て6件+ひとり親支援1件[児童扶養手当]、住宅5件、医療費6件)。都道府県・市区町村独自の上乗せ制度(こども医療費助成の自治体差、家賃補助の地域差等)は対象外とし、将来のフェーズで扱う。

調査時に判明した「事業主向け助成金」(建設業・運送業の技能実習コース助成金等)や「都道府県ごとに金額が大きく異なる修学資金貸付」(保育士・看護師の修学資金貸付制度)は、個人向け診断という本アプリの性質・データ精度の観点から今回は見送った。前者は労働者本人が直接申請できないため、後者は「全国共通」として単一の金額を出すと不正確になるため。

**match.jsのスコアリングを調整(2026-07-31)**: `purpose`一致の加点を3点→6点に引き上げた。理由: `housing`/`medical`/`family_support`は対象を広く取るため`employment_status`や`requires_employment_insurance`による絞り込みタグを持たない制度が多く、そのままだと「雇用保険必須」という無関係な制度が雇用形態・雇用保険の加点(最大5点)だけで目的一致制度(旧3点)を上回ってしまう不具合があった。既存の`skill_up`等は変更後もスコア上位の顔ぶれに回帰なし(検証済み)。

**2026-07-28に一次情報で裏取り済み、修正した点**:
- 東京都DXリスキリング助成金: 個人事業主・法人代表者本人は受講対象外(受講できるのは雇用する従業員のみ)と判明。`employment_status`から`self_employed`を削除、`conditions_text`を修正。公式URLをR8年度版に更新・403エラーは解消済み。
- 大阪府スキルアップ支援金: 対象者は「国の教育訓練給付金の対象とならない人(雇用保険未加入・加入期間1年未満・離職後1年超等)」であり、会社員一般が広く使える制度ではないと判明。`employment_status`から`employee`を削除、`conditions_text`を修正。
- 小規模事業者持続化補助金<創業型>: 副業の場合は開業届を提出し事業所得として営んでいることが必要(雑所得扱いの副業収入は対象外)と判明。`conditions_text`に追記。
- マナビDX女性向け講座: 受講料支援額は講座ごとに異なることを確認、`benefit_max_yen`を`null`のままとする判断は妥当と確認。

引き続き、公開前には全件を再度一次情報で確認することを推奨する(特に金額・期限は毎年度更新される可能性が高い)。

**2026-07-29に地域カバレッジを拡充**: 18件→32件。神奈川・愛知・埼玉・千葉・北海道・兵庫・宮城の7道府県を各2件追加(創業・開業支援7件、女性支援6件、自治体リスキリング支援2件、求職者支援1件)。全て一次情報(道府県庁・外郭団体公式サイト)で確認済みだが、以下は次回募集時期の確認が必要:
- 千葉県「ちば創業応援助成金」: 令和8年度分は締切済み(例年4月頃募集)。
- 兵庫県「起業家支援事業」: 直近募集が終了しており次回募集時期は要確認。
- 埼玉県「社会課題解決型創業支援プログラム」: 令和8年度の募集有無・後継プログラムの存在が未確定。

なお「創業予定」を条件に含む制度(千葉・北海道・兵庫・宮城)は、`employment_status`に`employee`も含めている(まだ会社員のまま創業準備中の人も対象になるため)。一方、愛知県の制度は「開業登記済みの個人事業主・法人代表者」が対象と明記されているため`self_employed`のみ。新しい都道府県データを追加する際は、条件文が「予定を含む」かどうかで`employment_status`にemployeeを含めるか判断すること。

**2026-07-29に全47都道府県+全国区分カテゴリまで拡充完了**: 32件→125件。残り37都道府県すべてを地域ブロック単位(東北5県・北関東甲信越6県・北陸東海6県・近畿4県・中国四国9県・九州沖縄7県)で並列リサーチし、各1〜3件を追加。加えて全国対象の新カテゴリ(高年齢雇用継続給付、教育訓練支援給付金、国民年金保険料免除・納付猶予制度、障害者職業能力開発校、再就職手当、高年齢求職者給付金)を6件追加。全て一次情報(都道府県庁・外郭団体・厚生労働省等の公式サイト)で確認済み。

- 「創業・開業支援」と「副業・兼業人材マッチング支援(プロフェッショナル人材戦略拠点)」はほぼ全都道府県に存在することを確認。ただしプロフェッショナル人材戦略拠点は**個人への直接金銭給付がなく、無料相談・マッチングのみ**という制度が大半(`benefit_max_yen: null`で統一)。
- 一部制度(熊本・鹿児島・沖縄の創業支援補助金など)は「既に開業している人は対象外」と明記されており`employment_status`が`["employee"]`のみになっている。地域によって「創業予定者のみ」「開業済みのみ」「両方可」がバラバラなので、追加時は必ず原文の条件を確認すること。
- 千葉・兵庫・熊本・大分・鹿児島・宮崎の創業系補助金は年度ごとの公募制のため、直近の公募が終了している可能性がある(例年継続実施されている制度として掲載)。次年度公募時期の確認は継続課題。
- リサーチ中、背景並列実行させたエージェントの一部が実際の調査を完了させず「調査中です」という報告だけで停止する不具合が複数回発生した(サブエージェント内でさらに別エージェントに委譲する挙動が原因と推測)。再実行時は「自分自身で完結させ、進捗報告だけで終わらせないこと」と明示的に指示することで解決した。同様の大規模並列リサーチを行う際は、事前にこの一文を含めることを推奨する。

## SEO用の個別ページ(2026-07-29追加)

診断アプリ本体はSPAでクローラーが個々の制度情報を直接インデックスできないため、`scripts/generate-seo-pages.js`で制度ごとの静的ページを機械生成している。

- `subsidy-checker/seido/{id}/index.html`: 制度1件ごとの詳細ページ。title/meta description/canonical/JSON-LD(`GovernmentService`)付き、診断アプリへの誘導CTAあり。
- `subsidy-checker/seido/index.html`: カテゴリ別に全件を一覧できるページ(JS任意の絞り込み入力欄付き)。
- `sitemap.xml`・`robots.txt`: 生成スクリプトが自動作成。
- `js/render.js`の結果カードにも「この制度の詳細ページを見る」という内部リンクを追加し、診断アプリ↔個別ページの内部リンク構造を作っている。
- タイトルタグは60字を超える場合、制度名の末尾の括弧書き(通称・愛称)を落として短縮する(`buildTitle`、2026-07-31実装)。H1見出し(本文側)は省略せず正式名称のまま表示する。
- マネタイズ導線(`related_offers`)は個別ページ側でも`scripts/generate-seo-pages.js`内の`buildOfferLinks`(js/render.jsと同等のロジック)で描画される(2026-07-29実装)。
- デプロイ後はGoogle Search Consoleに`sitemap.xml`を送信することを推奨(今回のスコープ外、手動作業)。

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

## マネタイズ導線

- 各制度の `related_offers` フィールド。`{label, url, type}` 形式のオブジェクトの配列で、結果カード・SEO個別ページの両方に「PR」バッジ付きボタンとして自動表示される(`js/render.js` / `scripts/generate-seo-pages.js` それぞれの `buildOfferLinks`)。2026-07-29にA8.net案件(purpose=`side_job`にクラウディア、purpose=`career_change`にIT求人ナビ フリーランス・社内SE転職ナビ)を実装。リンクは`rel="noopener sponsored"`を付与し、フッターにもプロモーション表記あり(景品表示法のステマ規制対応)。
- `related_subsidy_ids` フィールド: 関連する他制度のIDを列挙した配列(旧`related_offers`から改名、2026-07-29)。2026-07-31に結果カード・SEO個別ページ両方で「関連する制度」セクションとして描画するようにした(`js/render.js`/`scripts/generate-seo-pages.js`の`buildRelatedSubsidiesSection`)。現状125件中17件のみ値が入っている(残りは空配列)。
- クロスリンクバナー: `purpose`の回答が`side_job`ならsidejob-checkerへ、`career_change`ならcareer-checkerへのバナーを結果カードに表示する(`js/render.js`の`buildCrossLinkBanner`、2026-07-31実装)。SEO個別ページ側は回答の代わりに該当制度自身の`tags.purpose`配列で同様に判定する(`scripts/generate-seo-pages.js`)。sidejob-checker/career-checker側にも同様の相互リンクを実装済みで、3アプリ間で双方向にたどれる。
- 結果一覧下部の `#ad-slot-result-bottom`(広告プレースホルダ、現在は空)。
- 診断結果画面のメールリード獲得フォーム(`#lead-form`、現在は送信先未設定のダミー)。

新しいアフィリエイト案件を追加する場合は、`data/subsidies.json`の該当制度(または該当`purpose`タグを持つ全制度)の`related_offers`配列に`{label, url, type}`オブジェクトを追加し、`js/data.js`の再生成(上記手順)と`node scripts/generate-seo-pages.js`の再実行を行う。

**2026-07-31、housing/medical/family_support向けA8.net案件を実装(14件)**: ハピタスリフォーム(`mirai-eco-jutaku-2026`)、保険マンモス(医療費助成6件全て)、ベビープラネット(子育て支援7件全て)、CampusTop(子育て支援のうち教育文脈の3件)。

## デプロイ

`subsidy-checker/` フォルダをそのままGitHub Pages等の静的ホスティングにpushすれば公開できる(ビルド工程不要)。
