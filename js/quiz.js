/*
 * 質問フロー・状態管理・DOM描画。マッチングは match.js、結果描画は render.js に委譲する。
 */

const PREFECTURES = [
  { code: "hokkaido", label: "北海道" }, { code: "aomori", label: "青森県" }, { code: "iwate", label: "岩手県" },
  { code: "miyagi", label: "宮城県" }, { code: "akita", label: "秋田県" }, { code: "yamagata", label: "山形県" },
  { code: "fukushima", label: "福島県" }, { code: "ibaraki", label: "茨城県" }, { code: "tochigi", label: "栃木県" },
  { code: "gunma", label: "群馬県" }, { code: "saitama", label: "埼玉県" }, { code: "chiba", label: "千葉県" },
  { code: "tokyo", label: "東京都" }, { code: "kanagawa", label: "神奈川県" }, { code: "niigata", label: "新潟県" },
  { code: "toyama", label: "富山県" }, { code: "ishikawa", label: "石川県" }, { code: "fukui", label: "福井県" },
  { code: "yamanashi", label: "山梨県" }, { code: "nagano", label: "長野県" }, { code: "gifu", label: "岐阜県" },
  { code: "shizuoka", label: "静岡県" }, { code: "aichi", label: "愛知県" }, { code: "mie", label: "三重県" },
  { code: "shiga", label: "滋賀県" }, { code: "kyoto", label: "京都府" }, { code: "osaka", label: "大阪府" },
  { code: "hyogo", label: "兵庫県" }, { code: "nara", label: "奈良県" }, { code: "wakayama", label: "和歌山県" },
  { code: "tottori", label: "鳥取県" }, { code: "shimane", label: "島根県" }, { code: "okayama", label: "岡山県" },
  { code: "hiroshima", label: "広島県" }, { code: "yamaguchi", label: "山口県" }, { code: "tokushima", label: "徳島県" },
  { code: "kagawa", label: "香川県" }, { code: "ehime", label: "愛媛県" }, { code: "kochi", label: "高知県" },
  { code: "fukuoka", label: "福岡県" }, { code: "saga", label: "佐賀県" }, { code: "nagasaki", label: "長崎県" },
  { code: "kumamoto", label: "熊本県" }, { code: "oita", label: "大分県" }, { code: "miyazaki", label: "宮崎県" },
  { code: "kagoshima", label: "鹿児島県" }, { code: "okinawa", label: "沖縄県" },
];

const QUESTIONS = [
  {
    id: "employmentStatus",
    title: "現在の働き方は？",
    type: "options",
    required: true,
    options: [
      { value: "employee", label: "会社員(正社員)" },
      { value: "part_time", label: "パート・アルバイト" },
      { value: "self_employed", label: "自営業・フリーランス" },
      { value: "unemployed_recent", label: "離職中(1年以内)" },
      { value: "student", label: "学生" },
    ],
  },
  {
    id: "employmentInsurance",
    title: "雇用保険に加入していますか？",
    note: "会社員・パート等で働いている方向けの質問です。わからない場合は「わからない」を選んでください。",
    type: "options",
    required: true,
    options: [
      { value: "yes", label: "加入している" },
      { value: "no", label: "加入していない" },
      { value: "unknown", label: "わからない" },
    ],
  },
  {
    id: "ageRange",
    title: "年齢層を教えてください",
    type: "options",
    required: true,
    options: [
      { value: "~24", label: "24歳以下" },
      { value: "25-34", label: "25〜34歳" },
      { value: "35-44", label: "35〜44歳" },
      { value: "45-59", label: "45〜59歳" },
      { value: "60~", label: "60歳以上" },
    ],
  },
  {
    id: "purpose",
    title: "今回いちばんの目的は？",
    type: "options",
    required: true,
    options: [
      { value: "skill_up", label: "資格取得・スキルアップ" },
      { value: "side_job", label: "副業を始めたい" },
      { value: "career_change", label: "転職したい" },
      { value: "startup", label: "独立・開業したい" },
    ],
  },
  {
    id: "region",
    title: "お住まいの都道府県は？",
    type: "select",
    required: true,
    options: PREFECTURES.map((p) => ({ value: p.code, label: p.label })).concat([{ value: "no_answer", label: "回答しない" }]),
  },
  {
    id: "gender",
    title: "差し支えなければ性別を教えてください",
    note: "女性向け支援制度の判定に使います。答えたくない場合はスキップできます。",
    type: "options",
    required: false,
    options: [
      { value: "female", label: "女性" },
      { value: "male", label: "男性" },
      { value: "other", label: "回答しない" },
    ],
  },
];

const state = { index: 0, answers: {} };

const screens = {
  intro: document.getElementById("screen-intro"),
  quiz: document.getElementById("screen-quiz"),
  result: document.getElementById("screen-result"),
};
const quizCard = document.getElementById("quiz-card");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const backBtn = document.getElementById("btn-back");
const skipBtn = document.getElementById("btn-skip");
const resultSummaryEl = document.getElementById("result-summary");
const resultListEl = document.getElementById("result-list");

function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    screens[key].hidden = key !== name;
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function renderQuestion() {
  const q = QUESTIONS[state.index];
  progressLabel.textContent = `質問 ${state.index + 1} / ${QUESTIONS.length}`;
  progressBar.style.width = `${Math.round((state.index / QUESTIONS.length) * 100)}%`;
  backBtn.hidden = state.index === 0;
  skipBtn.hidden = q.required !== false;

  let html = `<p class="quiz-question">${escapeHtml(q.title)}</p>`;
  if (q.note) html += `<p class="quiz-question__note">${escapeHtml(q.note)}</p>`;

  if (q.type === "options") {
    html += `<div class="quiz-options">${q.options
      .map((o) => `<button type="button" class="quiz-option" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`)
      .join("")}</div>`;
  } else if (q.type === "select") {
    html += `<select class="quiz-select" id="quiz-select-input">
      <option value="">選択してください</option>
      ${q.options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
    </select>
    <button type="button" class="btn btn--primary btn--large" id="quiz-select-next" style="margin-top:16px;">次へ</button>`;
  }

  quizCard.innerHTML = html;

  if (q.type === "options") {
    quizCard.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.answers[q.id] = btn.dataset.value;
        goNext();
      });
    });
  } else if (q.type === "select") {
    const selectEl = quizCard.querySelector("#quiz-select-input");
    const nextBtn = quizCard.querySelector("#quiz-select-next");
    nextBtn.addEventListener("click", () => {
      if (!selectEl.value) {
        selectEl.focus();
        return;
      }
      state.answers[q.id] = selectEl.value;
      goNext();
    });
  }
}

function goNext() {
  if (state.index < QUESTIONS.length - 1) {
    state.index += 1;
    renderQuestion();
  } else {
    finishQuiz();
  }
}

function goBack() {
  if (state.index > 0) {
    state.index -= 1;
    renderQuestion();
  }
}

function skipCurrentQuestion() {
  const q = QUESTIONS[state.index];
  state.answers[q.id] = "skip";
  goNext();
}

function finishQuiz() {
  progressBar.style.width = "100%";
  const matchResult = matchSubsidies(SUBSIDIES, state.answers);
  renderResults(resultSummaryEl, resultListEl, matchResult);
  showScreen("result");
}

function startQuiz() {
  state.index = 0;
  state.answers = {};
  showScreen("quiz");
  renderQuestion();
}

function restartQuiz() {
  showScreen("intro");
}

document.getElementById("btn-start").addEventListener("click", startQuiz);
document.getElementById("btn-back").addEventListener("click", goBack);
document.getElementById("btn-skip").addEventListener("click", skipCurrentQuestion);
document.getElementById("btn-restart").addEventListener("click", restartQuiz);

showScreen("intro");
