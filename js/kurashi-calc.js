/*
 * 解説ページの計算機(ブラウザと Node の両方で読む。記事の早見表も build スクリプトがここを呼んで作る)
 *   1. 住民税非課税の判定 … guide/juminzei-hikazei-nenshu/
 *   2. 年金生活者支援給付金 … guide/nenkin-seikatsusha-shienkyufukin/
 *   3. 退職後の健康保険(任意継続と国保) … guide/taishokugo-kenkohoken/
 * 金額はすべて円。年度の数字は 2026-10-12 に各公式ページで確認した
 */

/* ---------- 1. 所得の計算と住民税非課税 ---------- */

/* 給与所得。nendo=8 は令和8年度の住民税(2025年の収入)、9 は令和9年度(2026年の収入)
 * 給与所得控除の最低額は令和8年度65万円、令和9年度74万円(横浜市「令和8年度税制改正の概要」)
 * 190万円以上660万円未満は所得税法別表第五(収入を4,000円単位に切り捨てて計算) */
function kyuyoShotoku(income, nendo) {
  if (!(income > 0)) return 0;
  const minDed = nendo >= 9 ? 740000 : 650000;
  let s;
  if (income < 1900000) s = income - 650000;
  else if (income < 6600000) {
    const a = Math.floor(income / 4000) * 4000;
    s = income < 3600000 ? a * 0.7 - 80000 : a * 0.8 - 440000;
  } else if (income <= 8500000) s = income * 0.9 - 1100000;
  else s = income - 1950000;
  s = Math.min(s, income - minDed);
  return Math.max(0, Math.floor(s));
}

/* 公的年金等に係る雑所得(公的年金等以外の合計所得が1,000万円以下の場合)。over65 はその年の12月31日に65歳以上 */
function nenkinShotoku(income, over65) {
  if (!(income > 0)) return 0;
  let ded;
  if (over65 ? income <= 3300000 : income <= 1300000) ded = over65 ? 1100000 : 600000;
  else if (income <= 4100000) ded = income * 0.25 + 275000;
  else if (income <= 7700000) ded = income * 0.15 + 685000;
  else if (income <= 10000000) ded = income * 0.05 + 1455000;
  else ded = 1955000;
  return Math.max(0, Math.floor(income - ded));
}

/* 合計所得金額。給与と年金の両方があるときは所得金額調整控除(最大10万円)を引く */
function gokeiShotoku({ kyuyo = 0, nenkin = 0, over65 = false, sonota = 0, nendo = 8 }) {
  let k = kyuyoShotoku(kyuyo, nendo);
  const n = nenkinShotoku(nenkin, over65);
  if (k > 0 && n > 0) k = Math.max(0, k - Math.max(0, Math.min(k, 100000) + Math.min(n, 100000) - 100000));
  return k + n + Math.max(0, sonota);
}

/* 均等割がかからない合計所得の上限(生活保護の級地で変わる)。fuyo は同一生計配偶者と扶養親族の人数 */
const HIKAZEI_KYUCHI = { 1: [350000, 210000], 2: [315000, 189000], 3: [280000, 168000] };
function hikazeiLimit(kyuchi, fuyo) {
  const [per, add] = HIKAZEI_KYUCHI[kyuchi];
  return per * (1 + fuyo) + 100000 + (fuyo > 0 ? add : 0);
}
/* 所得割がかからない総所得金額等の上限(級地によらない) */
function shotokuwariLimit(fuyo) { return 350000 * (1 + fuyo) + 100000 + (fuyo > 0 ? 320000 : 0); }
const HIKAZEI_SPECIAL = 1350000; // 障害者・未成年者・寡婦・ひとり親は合計所得135万円以下なら非課税

function hikazeiJudge(v) {
  const gokei = gokeiShotoku(v);
  const limit = hikazeiLimit(v.kyuchi, v.fuyo);
  const special = !!v.special;
  const hikazei = gokei <= limit || (special && gokei <= HIKAZEI_SPECIAL);
  return { gokei, limit, special, hikazei, shotokuwari: gokei <= shotokuwariLimit(v.fuyo) || (special && gokei <= HIKAZEI_SPECIAL),
    margin: (special ? Math.max(limit, HIKAZEI_SPECIAL) : limit) - gokei };
}

/* 所得が limit 以下に収まる最大の収入(円)。f は収入→所得の単調な関数 */
function maxIncome(f, limit) {
  let lo = 0, hi = 30000000;
  if (f(hi) <= limit) return hi;
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (f(m) <= limit) lo = m; else hi = m; }
  return lo;
}
const maxKyuyo = (limit, nendo) => maxIncome((x) => kyuyoShotoku(x, nendo), limit);
const maxNenkin = (limit, over65) => maxIncome((x) => nenkinShotoku(x, over65), limit);

/* ---------- 2. 年金生活者支援給付金(令和8年度。日本年金機構「老齢(補足的老齢)年金生活者支援給付金の概要」) ---------- */
const SHIEN_R8 = {
  kijun: 5620,                                              // 月額の基準(障害2級・遺族も同額)
  shogai1: 7025,
  menjo: { after: [11768, 5884], before: [11734, 5867] },   // [全額・4分の3・半額免除の月, 4分の1免除の月]
  limit: { after: [826500, 926500], before: [824100, 924100] }, // 昭和31年4月2日以後生まれ / 4月1日以前生まれ
};
/* 50銭未満切り捨て、50銭以上切り上げ */
const yenRound = (x) => Math.floor(x + 0.5);

function shienRourei(v) {
  const born = v.born === "before" ? "before" : "after";
  const months = v.months || 480;
  const nofu = Math.max(0, v.nofu || 0), full = Math.max(0, v.menjoFull || 0), qtr = Math.max(0, v.menjoQuarter || 0);
  const total = Math.max(0, (v.nenkinShunyu || 0) + (v.sonota || 0));
  const [lo, hi] = SHIEN_R8.limit[born];
  const base = { total, lo, hi };
  if (!v.over65) return { ...base, ok: false, reason: "age" };
  if (!v.hikazeiSetai) return { ...base, ok: false, reason: "setai" };
  if (total > hi) return { ...base, ok: false, reason: "income" };
  const a = yenRound(SHIEN_R8.kijun * nofu / months);
  if (total <= lo) {
    const [m1, m4] = SHIEN_R8.menjo[born];
    const b = yenRound((m1 * full + m4 * qtr) / months);
    return { ...base, ok: true, kind: "老齢年金生活者支援給付金", a, b, monthly: a + b };
  }
  const rate = (hi - total) / 100000;
  const monthly = yenRound(SHIEN_R8.kijun * nofu / months * rate);
  return { ...base, ok: true, kind: "補足的老齢年金生活者支援給付金", a: monthly, b: 0, rate, monthly };
}

/* ---------- 3. 退職後の健康保険 ---------- */
/* 協会けんぽ 令和8年度の都道府県単位保険料率(%)。子ども・子育て支援金0.23%は2026年4月分から、介護1.62%は40〜64歳 */
const KYOKAI_R8 = {
  北海道: 10.28, 青森県: 9.85, 岩手県: 9.51, 宮城県: 10.10, 秋田県: 10.01, 山形県: 9.75, 福島県: 9.50,
  茨城県: 9.52, 栃木県: 9.82, 群馬県: 9.68, 埼玉県: 9.67, 千葉県: 9.73, 東京都: 9.85, 神奈川県: 9.92,
  新潟県: 9.21, 富山県: 9.59, 石川県: 9.70, 福井県: 9.71, 山梨県: 9.55, 長野県: 9.63, 岐阜県: 9.80,
  静岡県: 9.61, 愛知県: 9.93, 三重県: 9.77, 滋賀県: 9.88, 京都府: 9.89, 大阪府: 10.13, 兵庫県: 10.12,
  奈良県: 9.91, 和歌山県: 10.06, 鳥取県: 9.86, 島根県: 9.94, 岡山県: 10.05, 広島県: 9.78, 山口県: 10.15,
  徳島県: 10.24, 香川県: 10.02, 愛媛県: 9.98, 高知県: 10.05, 福岡県: 10.11, 佐賀県: 10.55, 長崎県: 10.06,
  熊本県: 10.08, 大分県: 10.08, 宮崎県: 9.77, 鹿児島県: 10.13, 沖縄県: 9.44,
};
const KYOKAI_KODOMO_R8 = 0.23, KYOKAI_KAIGO_R8 = 1.62;
const NINKEI_MAX_R8 = 320000; // 任意継続の標準報酬月額の上限(令和8年度)
/* 健康保険の標準報酬月額(32万円まで。[この額未満, 標準報酬月額]) */
const HYOJUN_TABLE = [
  [63000, 58000], [73000, 68000], [83000, 78000], [93000, 88000], [101000, 98000], [107000, 104000],
  [114000, 110000], [122000, 118000], [130000, 126000], [138000, 134000], [146000, 142000], [155000, 150000],
  [165000, 160000], [175000, 170000], [185000, 180000], [195000, 190000], [210000, 200000], [230000, 220000],
  [250000, 240000], [270000, 260000], [290000, 280000], [310000, 300000],
];
function hyojunHoshu(gekkyu) {
  const row = HYOJUN_TABLE.find(([lt]) => gekkyu < lt);
  return row ? row[1] : 320000; // 31万円以上は任意継続では上限の32万円と同じ扱い
}
function ninkeiPremium({ gekkyu, pref, age }) {
  const h = Math.min(hyojunHoshu(gekkyu), NINKEI_MAX_R8);
  const kaigo = age >= 40 && age < 65;
  const rate = KYOKAI_R8[pref] + KYOKAI_KODOMO_R8 + (kaigo ? KYOKAI_KAIGO_R8 : 0);
  const monthly = yenRound(h * rate / 100);
  return { hyojun: h, rate, kaigo, monthly, annual: monthly * 12 };
}

/* 国民健康保険料。既定は東京23区(大田区の令和8年度の料率。23区は統一保険料方式) [所得割率%, 均等割, 限度額] */
const KOKUHO_TOKYO23_R8 = { iryo: [7.51, 47600, 670000], shien: [2.80, 17600, 260000], kodomo: [0.27, 1873, 30000], kaigo: [2.43, 17800, 170000] };
/* 均等割の軽減(7割・5割・2割)の基準。令和8年度 */
const KOKUHO_KEIGEN_R8 = { base: 430000, per5: 310000, per2: 570000, perEarner: 100000 };

function kokuhoPremium(v) {
  const r = v.rates || KOKUHO_TOKYO23_R8;
  const n = 1 + (v.family || 0);                  // 加入者数(本人＋家族。家族は収入なしとして計算)
  const n4064 = (v.age >= 40 && v.age < 65 ? 1 : 0) + (v.family4064 || 0);
  const nKids = v.kids18 || 0;                     // 18歳になった後の最初の3月31日までの子(支援金分の均等割がかからない)
  let shotoku = kyuyoShotoku(v.kyuyo || 0, v.nendo || 8);
  const hijihatsu = !!v.hijihatsu && v.age < 65;
  if (hijihatsu) shotoku = Math.floor(shotoku * 0.3);
  const earners = (v.kyuyo || 0) > 0 ? 1 : 0;
  const K = KOKUHO_KEIGEN_R8, extra = Math.max(0, earners - 1) * K.perEarner;
  const keigen = shotoku <= K.base + extra ? 0.7 : shotoku <= K.base + K.per5 * n + extra ? 0.5 : shotoku <= K.base + K.per2 * n + extra ? 0.2 : 0;
  const kiso = Math.max(0, shotoku - 430000);    // 算定基礎額
  const part = ([rate, per, cap], baseAmt, heads) => Math.min(cap, Math.floor(baseAmt * rate / 100) + Math.floor(per * heads * (1 - keigen)));
  const iryo = part(r.iryo, kiso, n);
  const shien = part(r.shien, kiso, n);
  const kodomo = part(r.kodomo, kiso, Math.max(0, n - nKids));
  const kaigo = n4064 > 0 ? part(r.kaigo, v.age >= 40 && v.age < 65 ? kiso : 0, n4064) : 0;
  const annual = Math.floor((iryo + shien + kodomo + kaigo) / 100) * 100;
  return { shotoku, hijihatsu, keigen, kiso, iryo, shien, kodomo, kaigo, annual, monthly: Math.round(annual / 12) };
}

if (typeof module !== "undefined") module.exports = {
  kyuyoShotoku, nenkinShotoku, gokeiShotoku, hikazeiLimit, shotokuwariLimit, hikazeiJudge, maxKyuyo, maxNenkin, HIKAZEI_SPECIAL,
  SHIEN_R8, shienRourei, yenRound,
  KYOKAI_R8, KYOKAI_KODOMO_R8, KYOKAI_KAIGO_R8, NINKEI_MAX_R8, hyojunHoshu, ninkeiPremium, KOKUHO_TOKYO23_R8, KOKUHO_KEIGEN_R8, kokuhoPremium,
};
