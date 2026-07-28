/*
 * マッチングエンジン。DOM・windowの状態には触れない純粋関数のみで構成する
 * (将来React等へ移植する際にロジックだけ持っていけるようにするため)。
 */

const AGE_BUCKETS = {
  "~24": [0, 24],
  "25-34": [25, 34],
  "35-44": [35, 44],
  "45-59": [45, 59],
  "60~": [60, 120],
};

function scoreSubsidy(subsidy, answers) {
  const tags = subsidy.tags || {};
  let score = 0;
  let hardFail = false;
  let needsReview = false;

  // 雇用形態: タグ指定があれば必須条件
  const employmentTags = tags.employment_status || [];
  if (employmentTags.length > 0) {
    if (employmentTags.includes(answers.employmentStatus)) {
      score += 3;
    } else {
      hardFail = true;
    }
  }

  // 雇用保険加入の要否
  if (tags.requires_employment_insurance) {
    if (answers.employmentInsurance === "no") {
      hardFail = true;
    } else if (answers.employmentInsurance === "unknown") {
      needsReview = true;
    } else {
      score += 2;
    }
  }

  // 目的: 一致すれば加点(除外はしない)
  const purposeTags = tags.purpose || [];
  if (purposeTags.includes(answers.purpose)) {
    score += 3;
  }

  // 地域: 全国対象なら常にOK、都道府県指定なら必須条件
  const regionTags = tags.region && tags.region.length > 0 ? tags.region : ["nationwide"];
  if (regionTags.includes("nationwide")) {
    score += 1;
  } else if (answers.region === "no_answer") {
    needsReview = true;
  } else if (regionTags.includes(answers.region)) {
    score += 2;
  } else {
    hardFail = true;
  }

  // 年齢: 指定があれば加点のみ(除外はしない)
  if (tags.age_range && (tags.age_range[0] != null || tags.age_range[1] != null)) {
    const [aMinRaw, aMaxRaw] = tags.age_range;
    const aMin = aMinRaw == null ? 0 : aMinRaw;
    const aMax = aMaxRaw == null ? 200 : aMaxRaw;
    const bucket = AGE_BUCKETS[answers.ageRange] || [0, 200];
    const overlaps = aMin <= bucket[1] && aMax >= bucket[0];
    if (overlaps) score += 1;
  }

  // 性別: 限定制度は、回答済みで一致しない場合のみ除外。未回答/スキップは除外しない
  const genderTags = tags.gender && tags.gender.length > 0 ? tags.gender : ["any"];
  if (!genderTags.includes("any")) {
    if (!answers.gender || answers.gender === "skip") {
      needsReview = true;
    } else if (genderTags.includes(answers.gender)) {
      score += 2;
    } else {
      hardFail = true;
    }
  }

  return Object.assign({}, subsidy, { score, hardFail, needsReview });
}

/**
 * @param {Array} subsidies - data.js の SUBSIDIES 配列
 * @param {Object} answers - quiz.js が集めた回答オブジェクト
 * @returns {{ results: Array, relaxed: boolean }}
 */
function matchSubsidies(subsidies, answers) {
  const primary = subsidies.map((s) => scoreSubsidy(s, answers)).filter((s) => !s.hardFail);

  if (primary.length > 0) {
    primary.sort((a, b) => b.score - a.score || (b.priority || 0) - (a.priority || 0));
    return { results: primary, relaxed: false };
  }

  // 0件時のフォールバック: 地域条件だけ緩めて再提示する
  const relaxedAnswers = Object.assign({}, answers, { region: "no_answer" });
  const relaxed = subsidies.map((s) => scoreSubsidy(s, relaxedAnswers)).filter((s) => !s.hardFail);
  relaxed.sort((a, b) => b.score - a.score || (b.priority || 0) - (a.priority || 0));
  return { results: relaxed, relaxed: true };
}
