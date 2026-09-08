// scripts/generate-seo-pages.js が生成。解説ページ(seido/<id>/)が存在する制度id。
// 診断結果からの内部リンクはこの集合に含まれる制度だけに張る。手で編集しない。
const SEIDO_DETAIL_IDS = new Set([
  "childcare-leave-benefit",
  "early-reemployment-allowance",
  "education-training-support-benefit",
  "general-education-training-benefit",
  "high-age-employment-continuation-benefit",
  "housing-security-benefit",
  "job-seeker-support-training-benefit",
  "local-startup-support-subsidy",
  "national-pension-premium-exemption",
  "sickness-and-injury-allowance",
  "small-business-sustainability-subsidy-startup",
  "specialized-practical-education-training-benefit",
  "specified-general-education-training-benefit",
]);
