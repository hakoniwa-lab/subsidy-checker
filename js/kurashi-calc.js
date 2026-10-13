/*
 * 解説ページの計算機(ブラウザと Node の両方で読む。記事の早見表も build スクリプトがここを呼んで作る)
 *   1. 住民税非課税の判定 … guide/juminzei-hikazei-nenshu/
 *   2. 年金生活者支援給付金 … guide/nenkin-seikatsusha-shienkyufukin/
 *   3. 退職後の健康保険(任意継続と国保) … guide/taishokugo-kenkohoken/
 *   4. 高額療養費(ひと月の自己負担の上限) … guide/kogaku-ryoyohi-jogen/
 *   5. 医療費控除・セルフメディケーション税制 … guide/iryohi-kojo-ikura/
 * 金額はすべて円。年度の数字は 2026-10-12(4・5は10-13)に各公式ページで確認した
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

/* ---------- 4. 高額療養費 ---------- */
/* 区分ごとの [基本の額, 1%がかかり始める総医療費(0なら定額), 多数回該当(4回目から), 年間上限(8月〜翌7月)]
 * r8 は令和8年8月診療分から(協会けんぽ「高額療養費」・厚労省「高額療養費制度の見直しについて」・豊中市の後期高齢者の表)
 * old は令和8年7月診療分まで(平成30年8月〜)。年間上限は無い
 * a/i/u は70歳未満のア・イ・ウと70歳以上の現役並みⅢ・Ⅱ・Ⅰで同じ額。e/o は70歳未満のエ・オ
 * ippan/low2/low1 は70歳以上の一般・低所得Ⅱ・低所得Ⅰの「外来＋入院(世帯)」。75歳以上の後期高齢者医療も同じ額 */
const KOGAKU = {
  r8: {
    a: [270300, 901000, 140100, 1680000], i: [179100, 597000, 93000, 1110000], u: [85800, 286000, 44400, 530000],
    e: [61500, 0, 44400, 530000], o: [36900, 0, 24600, 290000],
    ippan: [61500, 0, 44400, 530000], low2: [25700, 0, 24600, 290000], low1: [15700, 0, null, 180000],
  },
  old: {
    a: [252600, 842000, 140100, null], i: [167400, 558000, 93000, null], u: [80100, 267000, 44400, null],
    e: [57600, 0, 44400, null], o: [35400, 0, 24600, null],
    ippan: [57600, 0, 44400, null], low2: [24600, 0, null, null], low1: [15000, 0, null, null],
  },
};
/* 70歳以上の一般・低所得の外来(個人ごと) [月額, 外来の年間上限] */
const KOGAKU_GAIRAI = {
  r8: { ippan: [22000, 216000], low2: [11000, 96000], low1: [8000, null] },
  old: { ippan: [18000, 144000], low2: [8000, null], low1: [8000, null] },
};
/* エ(70歳以上は一般)のうち標準報酬月額15万円以下(年収約200万円以下)と確認できた人の年間上限。超えた分は令和9年8月以降に払い戻し */
const KOGAKU_NENKAN_LOW_R8 = 410000;

/* ひと月の上限額。iryohi は総医療費(10割) */
function kogakuLimit(kubun, iryohi, era, tasukai) {
  const [base, from, multi] = KOGAKU[era || "r8"][kubun];
  if (tasukai && multi) return multi;
  return from ? base + Math.max(0, Math.round((iryohi - from) / 100)) : base;
}

/* gairai・nyuin は窓口で払った額(保険診療の分)。70歳未満のア〜ウ・現役並みは3割負担なので 窓口負担÷0.3 を総医療費とみなす
 * 70歳以上の一般・低所得は、外来を個人の上限で抑えてから入院と合わせ、世帯の上限で抑える(本人ひとり分の計算) */
function kogakuCalc(v) {
  const era = v.era === "old" ? "old" : "r8";
  const gairai = Math.max(0, v.gairai || 0), nyuin = Math.max(0, v.nyuin || 0);
  const paid = gairai + nyuin;
  const G = KOGAKU_GAIRAI[era][v.kubun];
  let gairaiCapped = gairai, gairaiLimit = null;
  if (G) { gairaiLimit = G[0]; gairaiCapped = Math.min(gairai, gairaiLimit); }
  const iryohi = Math.round(paid / 0.3);
  const limit = kogakuLimit(v.kubun, iryohi, era, v.tasukai);
  const futan = Math.min(gairaiCapped + nyuin, limit);
  const [, from, multi, nenkan] = KOGAKU[era][v.kubun];
  return { era, paid, iryohi, limit, gairaiLimit, futan, modoru: paid - futan, formula: !!from && !(v.tasukai && multi),
    tasukai: !!(v.tasukai && multi), multi, nenkan, gairaiNenkan: G ? G[1] : null };
}

/* ---------- 5. 医療費控除 ---------- */
/* 所得税の基礎控除。year=2025 は令和7年分、2026 は令和8年分(令和9年分も同じ)。国税庁 No.1199 */
function kisoKojo(gokei, year) {
  if (gokei > 25000000) return 0;
  if (gokei > 24500000) return 160000;
  if (gokei > 24000000) return 320000;
  if (gokei > 23500000) return 480000;
  if (year >= 2026) return gokei <= 4890000 ? 1040000 : gokei <= 6550000 ? 670000 : 620000;
  return gokei <= 1320000 ? 950000 : gokei <= 3360000 ? 880000 : gokei <= 4890000 ? 680000 : gokei <= 6550000 ? 630000 : 580000;
}
/* 所得税(復興特別所得税を含まない)。課税所得は1,000円未満切り捨て。国税庁 No.2260 */
const SHOTOKUZEI_TABLE = [[1950000, 5, 0], [3300000, 10, 97500], [6950000, 20, 427500], [9000000, 23, 636000],
  [18000000, 33, 1536000], [40000000, 40, 2796000], [Infinity, 45, 4796000]];
function shotokuzei(kazei) {
  const k = Math.floor(Math.max(0, kazei) / 1000) * 1000;
  const [, rate, sub] = SHOTOKUZEI_TABLE.find(([lim]) => k <= lim);
  return Math.max(0, k * rate / 100 - sub);
}
/* 復興特別所得税(2.1%)を足して100円未満を切り捨てた、納める所得税 */
const shotokuzeiTotal = (kazei) => Math.floor(shotokuzei(kazei) * 1.021 / 100) * 100;

/* 医療費控除の額。足切りは10万円か総所得金額等の5%の少ない方、上限200万円 */
function iryohiKojo(iryohi, hoten, sotoku) {
  const ashikiri = Math.min(100000, Math.floor(Math.max(0, sotoku) * 0.05));
  return { ashikiri, kojo: Math.min(2000000, Math.max(0, (iryohi || 0) - (hoten || 0) - ashikiri)) };
}
/* セルフメディケーション税制(令和8年分までの購入分)。対象の市販薬が1万2千円を超えた分、上限8万8千円 */
const selfMedKojo = (otc) => Math.min(88000, Math.max(0, (otc || 0) - 12000));

/* 控除で減る税金の目安。v = { year, kyuyo, nenkin, over65, shakai(社会保険料。null なら給与の15%), hoka(ほかの所得控除), iryohi, hoten, otc }
 * 住民税は所得割10%で、課税所得(基礎控除43万円)が残っている分だけ減るとして計算 */
function iryohiKojoEffect(v) {
  const year = v.year >= 2026 ? 2026 : 2025;
  const gokei = gokeiShotoku({ kyuyo: v.kyuyo || 0, nenkin: v.nenkin || 0, over65: !!v.over65, nendo: year >= 2026 ? 9 : 8 });
  const shakai = v.shakai == null ? Math.round((v.kyuyo || 0) * 0.15) : v.shakai;
  const hoka = v.hoka || 0;
  const kiso = kisoKojo(gokei, year);
  const kazei = Math.max(0, gokei - shakai - kiso - hoka);
  const juminKazei = Math.max(0, gokei - shakai - 430000 - hoka);
  const effect = (kojo) => {
    const shotoku = shotokuzeiTotal(kazei) - shotokuzeiTotal(kazei - kojo);
    const jumin = Math.floor(Math.min(kojo, juminKazei) * 0.1 / 100) * 100;
    return { kojo, shotoku, jumin, total: shotoku + jumin };
  };
  const { ashikiri, kojo } = iryohiKojo(v.iryohi, v.hoten, gokei);
  const iryo = effect(kojo);
  const self = effect(selfMedKojo(v.otc));
  return { year, gokei, shakai, kiso, kazei, juminKazei, ashikiri, rate: (SHOTOKUZEI_TABLE.find(([lim]) => Math.floor(kazei / 1000) * 1000 <= lim))[1],
    iryo, self, better: self.total > iryo.total ? "self" : "iryo" };
}

if (typeof module !== "undefined") module.exports = {
  kyuyoShotoku, nenkinShotoku, gokeiShotoku, hikazeiLimit, shotokuwariLimit, hikazeiJudge, maxKyuyo, maxNenkin, maxIncome, HIKAZEI_SPECIAL,
  SHIEN_R8, shienRourei, yenRound,
  KYOKAI_R8, KYOKAI_KODOMO_R8, KYOKAI_KAIGO_R8, NINKEI_MAX_R8, hyojunHoshu, ninkeiPremium, KOKUHO_TOKYO23_R8, KOKUHO_KEIGEN_R8, kokuhoPremium,
  KOGAKU, KOGAKU_GAIRAI, KOGAKU_NENKAN_LOW_R8, kogakuLimit, kogakuCalc,
  kisoKojo, shotokuzei, shotokuzeiTotal, iryohiKojo, selfMedKojo, iryohiKojoEffect,
};
