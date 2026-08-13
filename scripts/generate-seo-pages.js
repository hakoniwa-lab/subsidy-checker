#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE_BASE = "https://hakoniwa-lab.github.io/subsidy-checker";
const { PREFECTURES } = require(path.join(ROOT, "js/regions.js"));
const SUBSIDIES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/subsidies.json"), "utf8"));

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

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function buildOfferLinks(subsidy) {
  const offers = subsidy.related_offers || [];
  if (offers.length === 0) return "";
  return offers
    .map(
      (o) =>
        `<a class="result-card__link result-card__link--offer" href="${escapeHtml(o.url)}" target="_blank" rel="noopener sponsored">${escapeHtml(o.label || "関連サービスを見る")}<span class="badge badge--pr">PR</span></a>`
    )
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

function buildRelatedSubsidiesSection(subsidy) {
  const ids = subsidy.related_subsidy_ids || [];
  if (ids.length === 0) return "";
  const items = ids
    .map((id) => SUBSIDIES.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `<li><a href="../${escapeHtml(s.id)}/">${escapeHtml(s.name)}</a></li>`)
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
  // 60字超過時は制度名の括弧書き(通称・愛称)を落として短縮する。本文側のH1は省略しない。
  const shortName = subsidy.name.replace(/\([^)]*\)$/, "");
  return `${regionPart}${shortName}｜${keyword}`;
}

function canonicalUrl(subsidy) {
  return `${SITE_BASE}/seido/${subsidy.id}/`;
}

function detailPageHtml(subsidy) {
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
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(subsidy.summary)}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6465548593525933" crossorigin="anonymous"></script>
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

  <footer class="app-footer">
    <p>本サイトは公的制度の情報提供を目的としており、申請の代行・保証を行うものではありません。制度の詳細・最新情報は各制度の公式サイト・所管窓口をご確認ください。「PR」表記のあるリンクにはプロモーション(アフィリエイト広告)が含まれます。</p>
    <p><a href="../../privacy.html">プライバシーポリシー</a></p>
  </footer>

</div>
</body>
</html>
`;
}

function listPageHtml(subsidies) {
  const byCategory = new Map();
  for (const s of subsidies) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category).push(s);
  }

  const categoryOrder = Object.keys(CATEGORY_KEYWORDS).filter((c) => byCategory.has(c));

  const sections = categoryOrder
    .map((cat) => {
      const items = byCategory.get(cat).slice().sort((a, b) => {
        const ra = regionLabel(a) || "";
        const rb = regionLabel(b) || "";
        return ra.localeCompare(rb, "ja");
      });
      const cards = items
        .map(
          (s) => `
        <li class="seido-list__item">
          <a class="seido-list__link" href="${s.id}/">
            <span class="badge badge--accent">${escapeHtml(regionLabel(s) || "全国")}</span>
            <span class="seido-list__name">${escapeHtml(s.name)}</span>
            <span class="seido-list__summary">${escapeHtml(s.summary)}</span>
          </a>
        </li>`
        )
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
<meta name="description" content="スキルアップ・副業・創業支援など、全${subsidies.length}件の給付金・補助金制度をカテゴリ別に一覧できます。">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6465548593525933" crossorigin="anonymous"></script>
<link rel="canonical" href="${SITE_BASE}/seido/">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<div class="app">
  <nav class="breadcrumb" aria-label="パンくずリスト">
    <a href="../index.html">診断トップ</a> &raquo; <span aria-current="page">制度一覧</span>
  </nav>
  <header class="app-header">
    <h1 class="app-header__title">給付金・補助金 制度一覧(全${subsidies.length}件)</h1>
    <p class="app-header__lead">カテゴリ別に全ての制度を掲載しています。気になる制度をタップすると詳細を確認できます。</p>
  </header>
  <p class="article-lead">教育訓練給付・求職者支援・創業支援・子育て支援・住宅費の助成・医療費助成など、全国共通の制度と47都道府県それぞれの独自制度をあわせて掲載しています。制度名で絞り込むか、下記のカテゴリから気になるものを探してみてください。どれが自分に合うか分からない場合は、ページ下部の5問診断もあわせてご利用ください。</p>
  <input type="search" id="seido-filter" class="quiz-select" placeholder="制度名やキーワードで絞り込む" aria-label="制度名で絞り込む">
  <main>${sections}</main>
  <div class="card detail-cta">
    <h2 class="card__title">どれが自分に合うか分からない方へ</h2>
    <a class="btn btn--primary btn--large" href="../index.html">5つの質問で診断する</a>
  </div>
  <footer class="app-footer">
    <p>本サイトは公的制度の情報提供を目的としており、申請の代行・保証を行うものではありません。制度の詳細・最新情報は各制度の公式サイト・所管窓口をご確認ください。「PR」表記のあるリンクにはプロモーション(アフィリエイト広告)が含まれます。</p>
    <p><a href="../privacy.html">プライバシーポリシー</a></p>
  </footer>
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

function sitemapXml(subsidies) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE_BASE}/`, lastmod: today, priority: "1.0" },
    { loc: `${SITE_BASE}/seido/`, lastmod: today, priority: "0.8" },
    ...subsidies.map((s) => ({
      loc: canonicalUrl(s),
      lastmod: s.source_checked_at || today,
      priority: "0.6",
    })),
  ];
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function robotsTxt() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_BASE}/sitemap.xml\n`;
}

function main() {
  const seen = new Set();
  for (const s of SUBSIDIES) {
    if (!/^[a-z0-9-]+$/.test(s.id)) {
      throw new Error(`不正なid形式です(kebab-case以外): ${s.id}`);
    }
    if (seen.has(s.id)) throw new Error(`idが重複しています: ${s.id}`);
    seen.add(s.id);
    if (!CATEGORY_KEYWORDS[s.category]) {
      throw new Error(`CATEGORY_KEYWORDSに未登録のカテゴリです: "${s.category}" (id: ${s.id})。scripts/generate-seo-pages.js の CATEGORY_KEYWORDS に追加してください。`);
    }
  }

  const seidoDir = path.join(ROOT, "seido");
  fs.rmSync(seidoDir, { recursive: true, force: true });
  fs.mkdirSync(seidoDir, { recursive: true });

  for (const subsidy of SUBSIDIES) {
    const dir = path.join(seidoDir, subsidy.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), detailPageHtml(subsidy), "utf8");
  }

  fs.writeFileSync(path.join(seidoDir, "index.html"), listPageHtml(SUBSIDIES), "utf8");
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemapXml(SUBSIDIES), "utf8");
  fs.writeFileSync(path.join(ROOT, "robots.txt"), robotsTxt(), "utf8");

  console.log(`生成完了: 詳細ページ${SUBSIDIES.length}件 + 一覧ページ1件 + sitemap.xml + robots.txt`);
}

main();
