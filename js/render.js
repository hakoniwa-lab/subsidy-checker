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

function formatCheckedDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return null;
  return `${y}年${Number(m)}月${Number(d)}日 時点で確認`;
}

function buildDetailPageLink(subsidy) {
  return `<a class="result-card__link result-card__link--detail" href="seido/${escapeHtml(subsidy.id)}/">この制度の詳細ページを見る</a>`;
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

function buildRelatedSubsidiesSection(subsidy) {
  const ids = subsidy.related_subsidy_ids || [];
  if (ids.length === 0) return "";
  const items = ids
    .map((id) => (typeof SUBSIDIES !== "undefined" ? SUBSIDIES.find((s) => s.id === id) : null))
    .filter(Boolean)
    .map((s) => `<li><a href="seido/${escapeHtml(s.id)}/">${escapeHtml(s.name)}</a></li>`)
    .join("");
  if (!items) return "";
  return `
    <div class="result-card__related">
      <p class="result-card__related-heading">関連する制度</p>
      <ul class="result-card__related-list">${items}</ul>
    </div>
  `;
}

function buildResultCard(subsidy) {
  const badges = [`<span class="badge">${escapeHtml(subsidy.category)}</span>`, `<span class="badge badge--accent">マッチ度 ${starRating(subsidy.score)}</span>`];
  if (subsidy.needsReview) {
    badges.push(`<span class="badge badge--warn">条件を要確認</span>`);
  }

  const yenLine = formatYen(subsidy.benefit_max_yen);
  const checkedLine = formatCheckedDate(subsidy.source_checked_at);

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
        ${buildDetailPageLink(subsidy)}
        ${buildOfferLinks(subsidy)}
      </div>
      ${buildRelatedSubsidiesSection(subsidy)}
      ${checkedLine ? `<p class="result-card__checked">${escapeHtml(checkedLine)}</p>` : ""}
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
