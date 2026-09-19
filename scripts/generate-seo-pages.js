#!/usr/bin/env node
"use strict";
/*
 * seido/ 配下の制度ページと制度一覧・sitemap・robots・js/seido-keep.js を生成する。
 *
 * 方針(2026-09-09 C案):
 *   - data/seido-articles/<id>.js がある制度だけ「解説ページ」として本文付きで生成し、
 *     一覧・診断結果・sitemap からリンクする(indexable)。
 *   - それ以外の制度は薄いテンプレページのまま noindex で生成し、どこからもリンクしない。
 *     一覧では公式サイトへ直接リンクする。
 *   - 解説を増やしたいときは data/seido-articles/ にファイルを1つ足して再生成するだけ。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE_BASE = "https://hakoniwalab.com/subsidy-checker";
const ADSENSE_TAG = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6465548593525933" crossorigin="anonymous"></script>`;
const { PREFECTURES } = require(path.join(ROOT, "js/regions.js"));
const SUBSIDIES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/subsidies.json"), "utf8"));

const ARTICLES_DIR = path.join(ROOT, "data/seido-articles");
const ARTICLES = Object.fromEntries(
  fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".js"))
    .map((f) => [f.replace(/\.js$/, ""), require(path.join(ARTICLES_DIR, f))])
);
const KEEP = new Set(Object.keys(ARTICLES));

const PREF_LABEL = Object.fromEntries(PREFECTURES.map((p) => [p.code, p.label]));

const CATEGORY_KEYWORDS = {
  "教育訓練給付": "スキルアップ・資格取得の給付金",
  "求職者支援": "求職者支援制度",
  "創業・開業支援": "起業・開業支援の補助金",
  "自治体リスキリング支援": "リスキリング支援・研修費助成",
  "女性支援": "女性向け支援制度",
  "移住支援": "移住支援金",
  "ひとり親支援": "ひとり親家庭支援",
  "副業・兼業人材マッチング支援": "副業・兼業支援",
  "IT・デジタル人材育成": "IT・デジタル人材育成支援",
  "介護・福祉資格取得支援": "介護・福祉資格取得支援",
  "デジタル人材育成": "デジタル人材育成支援",
  "高年齢者雇用支援": "高年齢者雇用給付金",
  "年金保険料減免": "年金保険料の減免制度",
  "障害者就労支援": "障害者就労支援",
  "就職促進給付": "就職促進給付金",
  "子育て支援": "子育て世帯向け支援制度",
  "住宅支援": "住宅費負担軽減の支援制度",
  "医療費助成": "医療費負担軽減の助成制度",
};

const ARTICLE_STYLE = `<style>
.guide-nav { max-width: 720px; margin: 0 auto 16px; padding: 0 20px; font-size: 0.85rem; color: var(--color-text-muted); }
.guide-nav a { color: var(--color-text-muted); }
.guide-lead { font-size: 0.95rem; }
.guide-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 0.92rem; }
.guide-table th, .guide-table td { border: 1px solid var(--color-border); padding: 8px 10px; text-align: left; vertical-align: top; }
.guide-table th { background: var(--color-bg); font-weight: 600; }
.guide-table-wrap { overflow-x: auto; }
.guide-note { font-size: 0.85rem; color: var(--color-text-muted); }
.card--article h3 { font-size: 1rem; margin: 18px 0 6px; }
.card--article ol { padding-left: 1.4em; }
.card--article ol li { margin-bottom: 6px; }
.guide-cta { text-align: center; }
.guide-cta .btn { display: inline-block; text-decoration: none; }
.detail-fields { margin: 0; }
</style>`;

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localDate(d = new Date()) {
  // toISOString はUTCなので朝9時前は前日になる。ローカル日付で組み立てる。
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function regionLabel(subsidy) {
  const regions = subsidy.tags.region || [];
  if (regions.length === 0 || regions.includes("nationwide")) return null;
  return PREF_LABEL[regions[0]] || null;
}

function yenLine(subsidy) {
  if (subsidy.benefit_max_yen == null) return null;
  return `上限目安 ${subsidy.benefit_max_yen.toLocaleString("ja-JP")}円`;
}

function formatCheckedDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return "";
  return `${y}年${Number(m)}月${Number(d)}日`;
}

/* type が "official" のリンクは広告ではない(提携前の公式サイトなど)ので、PR表記と sponsored を付けない */
function buildOfferLinks(subsidy, limit) {
  const offers = (subsidy.related_offers || []).slice(0, limit || Infinity);
  if (offers.length === 0) return "";
  return offers
    .map((o) => {
      const isAd = o.type !== "official";
      return `<a class="result-card__link result-card__link--offer" href="${escapeHtml(o.url)}" target="_blank" rel="noopener${isAd ? " sponsored" : ""}">${escapeHtml(o.label || "関連サービスを見る")}${isAd ? '<span class="badge badge--pr">PR</span>' : ""}</a>`;
    })
    .join("");
}

function buildCrossLinkBanner(subsidy) {
  const purposeTags = (subsidy.tags && subsidy.tags.purpose) || [];
  if (purposeTags.includes("side_job")) {
    return `<a class="cross-link-banner" href="../../../sidejob-checker/">この制度を使いながら、向いていそうな副業ジャンルも副業ジャンル診断で確認できます →</a>`;
  }
  if (purposeTags.includes("career_change")) {
    return `<a class="cross-link-banner" href="../../../career-checker/">キャリアチェンジに合いそうな転職エージェントも、転職エージェント診断で確認できます →</a>`;
  }
  return "";
}

// 関連制度: 解説ページがある制度だけ内部リンク。それ以外は名前のみ(薄いページへは誘導しない)。
function buildRelatedSubsidiesSection(subsidy) {
  const ids = subsidy.related_subsidy_ids || [];
  if (ids.length === 0) return "";
  const items = ids
    .map((id) => SUBSIDIES.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) =>
      KEEP.has(s.id)
        ? `<li><a href="../${escapeHtml(s.id)}/">${escapeHtml(s.name)}</a></li>`
        : `<li>${escapeHtml(s.name)}（<a href="${escapeHtml(s.apply_url)}" target="_blank" rel="noopener">公式サイト</a>）</li>`
    )
    .join("");
  if (!items) return "";
  return `
    <div class="result-card__related">
      <p class="result-card__related-heading">関連する制度</p>
      <ul class="result-card__related-list">${items}</ul>
    </div>
  `;
}

function buildTitle(subsidy) {
  const region = regionLabel(subsidy);
  const keyword = CATEGORY_KEYWORDS[subsidy.category];
  const regionPart = region ? `【${region}】` : "【全国】";
  const full = `${regionPart}${subsidy.name}｜${keyword}`;
  if (full.length <= 60) return full;
  const shortName = subsidy.name.replace(/\([^)]*\)$/, "");
  return `${regionPart}${shortName}｜${keyword}`;
}

function canonicalUrl(subsidy) {
  return `${SITE_BASE}/seido/${subsidy.id}/`;
}

function footerHtml(depth) {
  const up = "../".repeat(depth);
  return `
  <footer class="app-footer">
    <p>本サイトは公的制度の情報提供を目的としており、申請の代行・保証を行うものではありません。制度の内容・金額・期限は改正されることがあります。申請前に必ず各制度の公式サイト・所管窓口で最新情報をご確認ください。「PR」表記のあるリンクにはプロモーション(アフィリエイト広告)が含まれます。</p>
    <p><a href="${up}about.html">運営者情報</a>・<a href="${up}contact.html">お問い合わせ</a>・<a href="${up}privacy.html">プライバシーポリシー</a></p>
  </footer>`;
}

// ---------- 解説ページ(indexable) ----------
function articlePageHtml(subsidy, art) {
  const region = regionLabel(subsidy);
  const yen = yenLine(subsidy);
  const canonical = canonicalUrl(subsidy);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "GovernmentService",
        name: subsidy.name,
        description: subsidy.summary,
        provider: { "@type": "Organization", name: subsidy.organization },
        areaServed: region || "日本全国",
        url: canonical,
      },
      {
        "@type": "FAQPage",
        mainEntity: (art.faq || []).map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  });

  const points = (art.points || []).map((p) => `<li>${escapeHtml(p)}</li>`).join("\n          ");
  const sections = (art.sections || [])
    .map(
      (s) => `
      <div class="card card--article">
        <h2>${escapeHtml(s.h2)}</h2>${s.html}
      </div>`
    )
    .join("");
  const faq = (art.faq || [])
    .map(
      (f) => `
        <details class="faq-item">
          <summary>${escapeHtml(f.q)}</summary>
          <p>${escapeHtml(f.a)}</p>
        </details>`
    )
    .join("");
  const sources = (art.sources || [])
    .map((s) => `<li>${escapeHtml(s.label)} <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a></li>`)
    .join("\n          ");
  const guides = (art.guides || [])
    .map((g) => `<li><a href="${escapeHtml(g.href)}">${escapeHtml(g.label)}</a>${g.note ? ` — ${escapeHtml(g.note)}` : ""}</li>`)
    .join("\n          ");
  const offers = buildOfferLinks(subsidy, 3);
  const related = buildRelatedSubsidiesSection(subsidy);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(art.title)}</title>
<meta name="description" content="${escapeHtml(art.description)}">
${ADSENSE_TAG}
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="../../css/style.css">
<script type="application/ld+json">${jsonLd}</script>
${ARTICLE_STYLE}
</head>
<body>
<div class="app">

  <nav class="guide-nav" aria-label="パンくずリスト">
    <a href="../../index.html">給付金・補助金診断</a> &raquo;
    <a href="../index.html">制度一覧</a> &raquo;
    <span aria-current="page">${escapeHtml(subsidy.name)}</span>
  </nav>

  <header class="app-header">
    <p class="app-header__eyebrow">${escapeHtml(art.eyebrow || "給付金・補助金ガイド")}</p>
    <h1 class="app-header__title">${escapeHtml(subsidy.name)}</h1>
    <p class="app-header__lead">${escapeHtml(subsidy.summary)}</p>
  </header>

  <main class="main">

    <section class="article">

      <div class="card card--article">
        <p class="guide-lead">${art.lead}</p>
        <ul class="intro-points">
          ${points}
        </ul>
      </div>

      <div class="card card--article">
        <h2>制度の基本情報</h2>
        <div class="result-card__badges">
          <span class="badge">${escapeHtml(subsidy.category)}</span>
          <span class="badge badge--accent">${escapeHtml(region || "全国対象")}</span>
        </div>
        <dl class="detail-fields">
          <div class="detail-field">
            <dt>実施主体</dt>
            <dd>${escapeHtml(subsidy.organization)}</dd>
          </div>
          <div class="detail-field">
            <dt>給付・助成内容</dt>
            <dd>${escapeHtml(subsidy.benefit_text)}${yen ? `（${escapeHtml(yen)}）` : ""}</dd>
          </div>
          <div class="detail-field">
            <dt>対象条件</dt>
            <dd>${escapeHtml(subsidy.conditions_text)}</dd>
          </div>
          <div class="detail-field">
            <dt>申請方法</dt>
            <dd>${escapeHtml(subsidy.apply_method)}</dd>
          </div>
        </dl>
        <p><a class="result-card__link" href="${escapeHtml(subsidy.apply_url)}" target="_blank" rel="noopener">公式サイトで最新情報を見る →</a></p>
        <p class="guide-note">${escapeHtml(formatCheckedDate(subsidy.source_checked_at))} 時点の公式情報をもとに整理しています。金額・期限は改正されることがあるので、申請前に公式サイトでご確認ください。</p>
      </div>
${sections}

      <div class="card card--article">
        <h2>よくある質問</h2>${faq}
      </div>

      <div class="card card--article">
        <h2>他にも使える制度があるかもしれません</h2>
        <p>5つの質問に答えるだけで、あなたの状況に合いそうな給付金・補助金の候補を確認できます。無料・登録不要で、入力内容は端末の中だけで処理されます。</p>
        <p class="guide-cta"><a class="btn btn--primary btn--large" href="../../index.html">5つの質問で診断する</a></p>
        ${related}
        ${buildCrossLinkBanner(subsidy)}
        <p class="guide-note" style="margin-top:12px;"><a href="../index.html">制度一覧（全${SUBSIDIES.length}件）で他の制度を探す</a></p>
      </div>

      <div class="card card--article">
        <h2>あわせて確認しておきたいこと</h2>
        <ul>
          ${guides}
        </ul>
      </div>
${offers ? `
      <div class="card card--article">
        <h2>関連サービス</h2>
        <p class="guide-note">この制度とあわせて検討されることの多いサービスです。「PR」表記のリンクにはプロモーションが含まれます。</p>
        <div class="detail-actions">${offers}</div>
      </div>` : ""}

      <div class="card card--article">
        <h2>出典</h2>
        <ul>
          ${sources}
        </ul>
      </div>

    </section>

  </main>
${footerHtml(3)}

</div>
</body>
</html>
`;
}

// ---------- 薄いテンプレページ(noindex・広告なし・どこからもリンクしない) ----------
function thinPageHtml(subsidy) {
  const title = buildTitle(subsidy);
  const region = regionLabel(subsidy);
  const yen = yenLine(subsidy);
  const canonical = canonicalUrl(subsidy);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: subsidy.name,
    description: subsidy.summary,
    provider: { "@type": "Organization", name: subsidy.organization },
    areaServed: region || "日本全国",
    url: canonical,
  });

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,follow">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(subsidy.summary)}">
<link rel="canonical" href="${canonical}">
<link rel="stylesheet" href="../../css/style.css">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<div class="app detail-page">

  <nav class="breadcrumb" aria-label="パンくずリスト">
    <a href="../../index.html">診断トップ</a> &raquo;
    <a href="../index.html">制度一覧</a> &raquo;
    <span aria-current="page">${escapeHtml(subsidy.name)}</span>
  </nav>

  <article class="card detail-card">
    <div class="result-card__badges">
      <span class="badge">${escapeHtml(subsidy.category)}</span>
      <span class="badge badge--accent">${escapeHtml(region || "全国対象")}</span>
    </div>
    <h1 class="detail-card__title">${escapeHtml(subsidy.name)}</h1>
    <p class="detail-card__org">${escapeHtml(subsidy.organization)}</p>
    <p class="detail-card__summary">${escapeHtml(subsidy.summary)}</p>

    <dl class="detail-fields">
      <div class="detail-field">
        <dt>給付・助成内容</dt>
        <dd>${escapeHtml(subsidy.benefit_text)}${yen ? `(${escapeHtml(yen)})` : ""}</dd>
      </div>
      <div class="detail-field">
        <dt>対象条件</dt>
        <dd>${escapeHtml(subsidy.conditions_text)}</dd>
      </div>
      <div class="detail-field">
        <dt>申請方法</dt>
        <dd>${escapeHtml(subsidy.apply_method)}</dd>
      </div>
    </dl>

    <div class="detail-actions">
      <a class="result-card__link" href="${escapeHtml(subsidy.apply_url)}" target="_blank" rel="noopener">公式サイトで詳細を見る →</a>
      ${buildOfferLinks(subsidy)}
    </div>

    ${buildRelatedSubsidiesSection(subsidy)}
    ${buildCrossLinkBanner(subsidy)}

    <p class="result-card__checked">${escapeHtml(formatCheckedDate(subsidy.source_checked_at))} 時点で確認</p>
  </article>

  <div class="card detail-cta">
    <h2 class="card__title">他にも使える制度があるかもしれません</h2>
    <p>5つの質問に答えるだけで、あなたに合いそうな給付金・補助金を診断できます。</p>
    <a class="btn btn--primary btn--large" href="../../index.html">5つの質問で診断する</a>
  </div>

  <p class="detail-back"><a href="../index.html">&larr; 制度一覧に戻る</a></p>
${footerHtml(2)}

</div>
</body>
</html>
`;
}

// ---------- 制度一覧 ----------
function listPageHtml(subsidies) {
  const byCategory = new Map();
  for (const s of subsidies) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category).push(s);
  }
  const categoryOrder = Object.keys(CATEGORY_KEYWORDS).filter((c) => byCategory.has(c));
  const keepCount = subsidies.filter((s) => KEEP.has(s.id)).length;

  const sections = categoryOrder
    .map((cat) => {
      const items = byCategory.get(cat).slice().sort((a, b) => {
        // 解説ページがあるものを先頭に、その後は地域名順
        const ka = KEEP.has(a.id) ? 0 : 1;
        const kb = KEEP.has(b.id) ? 0 : 1;
        if (ka !== kb) return ka - kb;
        const ra = regionLabel(a) || "";
        const rb = regionLabel(b) || "";
        return ra.localeCompare(rb, "ja");
      });
      const cards = items
        .map((s) => {
          const inner = `
            <span class="badge badge--accent">${escapeHtml(regionLabel(s) || "全国")}</span>
            <span class="seido-list__name">${escapeHtml(s.name)}</span>
            <span class="seido-list__summary">${escapeHtml(s.summary)}</span>`;
          if (KEEP.has(s.id)) {
            return `
        <li class="seido-list__item">
          <a class="seido-list__link" href="${s.id}/">${inner}
            <span class="seido-list__more">解説を読む →</span>
          </a>
        </li>`;
          }
          return `
        <li class="seido-list__item">
          <a class="seido-list__link seido-list__link--official" href="${escapeHtml(s.apply_url)}" target="_blank" rel="noopener">${inner}
            <span class="seido-list__more">公式サイトで確認 ↗</span>
          </a>
        </li>`;
        })
        .join("");
      return `
      <section class="seido-list__section">
        <h2 class="seido-list__heading">${escapeHtml(cat)}(${items.length}件)</h2>
        <ul class="seido-list__group">${cards}</ul>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>制度一覧(全${subsidies.length}件) | 給付金・補助金診断</title>
<meta name="description" content="教育訓練給付・求職者支援・創業支援・子育て・住宅・医療費など、全国共通の制度と47都道府県の独自制度あわせて${subsidies.length}件をカテゴリ別に一覧できます。主要${keepCount}制度は条件・計算例・申請手順の解説付き、それ以外は公式サイトへ直接リンクしています。">
${ADSENSE_TAG}
<link rel="canonical" href="${SITE_BASE}/seido/">
<link rel="stylesheet" href="../css/style.css">
<style>
.seido-list__more { display: block; margin-top: 8px; font-size: 0.85rem; color: var(--color-primary); font-weight: 600; }
.seido-list__link--official .seido-list__more { color: var(--color-text-muted); font-weight: 400; }
</style>
</head>
<body>
<div class="app">
  <nav class="breadcrumb" aria-label="パンくずリスト">
    <a href="../index.html">診断トップ</a> &raquo; <span aria-current="page">制度一覧</span>
  </nav>
  <header class="app-header">
    <h1 class="app-header__title">給付金・補助金 制度一覧(全${subsidies.length}件)</h1>
    <p class="app-header__lead">カテゴリ別に全ての制度を掲載しています。「解説を読む」がある制度は条件・計算例・申請手順をまとめた解説ページへ、それ以外は公式サイトへ直接進めます。</p>
  </header>
  <p class="article-lead">教育訓練給付・求職者支援・創業支援・子育て支援・住宅費の助成・医療費助成など、全国共通の制度と47都道府県それぞれの独自制度をあわせて掲載しています。会社員・パート・フリーランスの方が使いやすい全国共通の主要${keepCount}制度には、本サイト独自の解説ページを用意しました。都道府県の独自制度は年度ごとに内容が変わりやすいため、公式サイトへ直接リンクしています。制度名で絞り込むか、下記のカテゴリから気になるものを探してみてください。どれが自分に合うか分からない場合は、ページ下部の5問診断もあわせてご利用ください。</p>
  <input type="search" id="seido-filter" class="quiz-select" placeholder="制度名やキーワードで絞り込む" aria-label="制度名で絞り込む">
  <main>${sections}</main>
  <div class="card detail-cta">
    <h2 class="card__title">どれが自分に合うか分からない方へ</h2>
    <a class="btn btn--primary btn--large" href="../index.html">5つの質問で診断する</a>
  </div>
${footerHtml(1)}
</div>
<script>
document.getElementById("seido-filter").addEventListener("input", function (e) {
  var q = e.target.value.trim();
  document.querySelectorAll(".seido-list__item").forEach(function (li) {
    li.hidden = !!q && li.textContent.indexOf(q) === -1;
  });
});
</script>
</body>
</html>
`;
}

// guide/ 配下の解説記事。seido/ とは別に人が手で作るので、ディレクトリを走査して拾う。
// (これを忘れると再生成のたびに sitemap から記事が消える。2026-09-09 に実際に消した)
function guidePages() {
  const dir = path.join(ROOT, "guide");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "index.html")))
    .filter((e) => !/noindex/i.test(fs.readFileSync(path.join(dir, e.name, "index.html"), "utf8")))
    .map((e) => `${SITE_BASE}/guide/${e.name}/`);
}

function sitemapXml(subsidies) {
  const today = localDate();
  const urls = [
    { loc: `${SITE_BASE}/`, lastmod: today, priority: "1.0" },
    { loc: `${SITE_BASE}/seido/`, lastmod: today, priority: "0.8" },
    ...guidePages().map((loc) => ({ loc, lastmod: today, priority: "0.8" })),
    ...subsidies
      .filter((s) => KEEP.has(s.id))
      .map((s) => ({ loc: canonicalUrl(s), lastmod: today, priority: "0.8" })),
  ];
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_BASE}/sitemap.xml\n`;
}

function seidoKeepJs() {
  const ids = [...KEEP].sort().map((id) => `  "${id}",`).join("\n");
  return `// scripts/generate-seo-pages.js が生成。解説ページ(seido/<id>/)が存在する制度id。\n// 診断結果からの内部リンクはこの集合に含まれる制度だけに張る。手で編集しない。\nconst SEIDO_DETAIL_IDS = new Set([\n${ids}\n]);\n`;
}

function main() {
  const seen = new Set();
  for (const s of SUBSIDIES) {
    if (!/^[a-z0-9-]+$/.test(s.id)) throw new Error(`不正なid形式です(kebab-case以外): ${s.id}`);
    if (seen.has(s.id)) throw new Error(`idが重複しています: ${s.id}`);
    seen.add(s.id);
    if (!CATEGORY_KEYWORDS[s.category]) {
      throw new Error(`CATEGORY_KEYWORDSに未登録のカテゴリです: "${s.category}" (id: ${s.id})`);
    }
  }
  for (const id of KEEP) {
    if (!seen.has(id)) throw new Error(`data/seido-articles/${id}.js に対応する制度が subsidies.json にありません`);
    const a = ARTICLES[id];
    for (const k of ["title", "description", "lead", "sections", "faq", "sources"]) {
      if (!a[k]) throw new Error(`data/seido-articles/${id}.js に ${k} がありません`);
    }
  }

  const seidoDir = path.join(ROOT, "seido");
  fs.rmSync(seidoDir, { recursive: true, force: true });
  fs.mkdirSync(seidoDir, { recursive: true });

  let articleCount = 0;
  for (const subsidy of SUBSIDIES) {
    const dir = path.join(seidoDir, subsidy.id);
    fs.mkdirSync(dir, { recursive: true });
    const html = KEEP.has(subsidy.id) ? articlePageHtml(subsidy, ARTICLES[subsidy.id]) : thinPageHtml(subsidy);
    if (KEEP.has(subsidy.id)) articleCount += 1;
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  }

  fs.writeFileSync(path.join(seidoDir, "index.html"), listPageHtml(SUBSIDIES), "utf8");
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemapXml(SUBSIDIES), "utf8");
  fs.writeFileSync(path.join(ROOT, "robots.txt"), robotsTxt(), "utf8");
  fs.writeFileSync(path.join(ROOT, "js/seido-keep.js"), seidoKeepJs(), "utf8");

  const guides = guidePages();
  console.log(
    `生成完了: 解説ページ${articleCount}件(indexable) + noindexページ${SUBSIDIES.length - articleCount}件 + 一覧1件 + robots.txt + js/seido-keep.js
` +
      `  sitemap.xml: ${2 + guides.length + articleCount}件 (トップ + 制度一覧 + guide記事${guides.length}件 + 制度解説${articleCount}件)`
  );
}

main();
