/*
 * 結果カードのDOM生成。マッチングスコアやタグから見た目を組み立てるだけで、
 * データ取得・状態管理には関与しない。
 */

function starRating(score) {
  if (score >= 7) return "★★★";
  if (score >= 4) return "★★☆";
  return "★☆☆";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function formatYen(yen) {
  if (yen == null) return null;
  return `上限目安 ${yen.toLocaleString("ja-JP")}円`;
}

function buildOfferLinks(subsidy) {
  const offers = subsidy.related_offers || [];
  if (offers.length === 0) return "";
  // related_offers は現状IDの配列(将来アフィリエイトリンクオブジェクトに置き換え可能)
  const objectOffers = offers.filter((o) => typeof o === "object" && o && o.url);
  if (objectOffers.length === 0) return "";
  return objectOffers
    .map(
      (o) =>
        `<a class="result-card__link result-card__link--offer" href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${escapeHtml(o.label || "関連サービスを見る")}</a>`
    )
    .join("");
}

function buildResultCard(subsidy) {
  const badges = [`<span class="badge">${escapeHtml(subsidy.category)}</span>`, `<span class="badge badge--accent">マッチ度 ${starRating(subsidy.score)}</span>`];
  if (subsidy.needsReview) {
    badges.push(`<span class="badge badge--warn">条件を要確認</span>`);
  }

  const yenLine = formatYen(subsidy.benefit_max_yen);

  return `
    <article class="result-card">
      <div class="result-card__badges">${badges.join("")}</div>
      <h3 class="result-card__name">${escapeHtml(subsidy.name)}</h3>
      <p class="result-card__benefit">${escapeHtml(subsidy.benefit_text)}${yenLine ? ` (${escapeHtml(yenLine)})` : ""}</p>
      <p class="result-card__org">${escapeHtml(subsidy.organization)}</p>
      <p class="result-card__summary">${escapeHtml(subsidy.summary)}</p>
      <p class="result-card__conditions">対象条件: ${escapeHtml(subsidy.conditions_text)}</p>
      <div class="result-card__actions">
        <a class="result-card__link" href="${escapeHtml(subsidy.apply_url)}" target="_blank" rel="noopener">公式サイトで詳細を見る →</a>
        ${buildOfferLinks(subsidy)}
      </div>
    </article>
  `;
}

/**
 * @param {HTMLElement} summaryEl
 * @param {HTMLElement} listEl
 * @param {{results: Array, relaxed: boolean}} matchResult
 */
function renderResults(summaryEl, listEl, matchResult) {
  const { results, relaxed } = matchResult;

  if (results.length === 0) {
    summaryEl.innerHTML = `
      <p class="result-summary__count">条件に合う制度が見つかりませんでした</p>
      <p class="result-summary__note">回答内容を変えて、もう一度お試しください。</p>
    `;
    listEl.innerHTML = `<div class="result-empty">該当する制度がありませんでした。「もう一度診断する」からやり直せます。</div>`;
    return;
  }

  summaryEl.innerHTML = `
    <p class="result-summary__count">あなたに合いそうな制度が ${results.length} 件見つかりました</p>
    <p class="result-summary__note">${relaxed ? "地域条件を緩めて表示しています。お住まいの地域の詳細は各公式サイトでご確認ください。" : "マッチ度が高い順に表示しています。"}</p>
  `;

  listEl.innerHTML = results.map(buildResultCard).join("");
}
