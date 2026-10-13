/*
 * 解説ページの計算機(ブラウザと Node の両方で読む。記事の早見表も build スクリプトがここを呼んで作る)
 *   1. 住民税非課税の判定 … guide/juminzei-hikazei-nenshu/
 *   2. 年金生活者支援給付金 … guide/nenkin-seikatsusha-shienkyufukin/
 *   3. 退職後の健康保険(任意継続と国保) … guide/taishokugo-kenkohoken/
 *   4. 高額療養費(ひと月の自己負担の上限) … guide/kogaku-ryoyohi-jogen/
 *   5. 医療費控除・セルフメディケーション税制 … guide/iryohi-kojo-ikura/
 *   6. 標準報酬月額と会社員の手取りの目安(7で使う)
 *   7. 産休・育休でもらえるお金(出産手当金・育児休業給付金・出生後休業支援給付金) … guide/sankyu-ikukyu-okane/
 *   8. 児童手当の総額 … guide/jido-teate-sogaku/
 *   9. 児童扶養手当(ひとり親) … guide/jido-fuyo-teate/
 * 金額はすべて円。年度の数字は 2026-10-12(4〜8は10-13)に各公式ページで確認した
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

/* ---------- 6. 標準報酬月額と会社員の手取りの目安 ---------- */
/* 健康保険の標準報酬月額(50等級。[この額未満, 標準報酬月額]、135.5万円以上は139万円)。厚生年金は8.8万〜65万円の32等級 */
const HYOJUN_KENPO = HYOJUN_TABLE.concat([
  [330000, 320000], [350000, 340000], [370000, 360000], [395000, 380000], [425000, 410000], [455000, 440000],
  [485000, 470000], [515000, 500000], [545000, 530000], [575000, 560000], [605000, 590000], [635000, 620000],
  [665000, 650000], [695000, 680000], [730000, 710000], [770000, 750000], [810000, 790000], [855000, 830000],
  [905000, 880000], [955000, 930000], [1005000, 980000], [1055000, 1030000], [1115000, 1090000], [1175000, 1150000],
  [1235000, 1210000], [1295000, 1270000], [1355000, 1330000],
]);
function hyojunKenpo(gekkyu) {
  const row = HYOJUN_KENPO.find(([lt]) => gekkyu < lt);
  return row ? row[1] : 1390000;
}
const hyojunNenkin = (gekkyu) => Math.min(650000, Math.max(88000, hyojunKenpo(gekkyu)));
/* 本人負担の料率(%)。健康保険は協会けんぽの全国平均(令和8年度)、雇用保険は一般の事業の労働者負担(令和8年度) */
const SHAHO_R8 = { kenpo: 9.90, kodomo: 0.23, kaigo: 1.62, nenkin: 18.3, koyo: 0.5 };
function shahoMonthly(gekkyu, over40) {
  const h = hyojunKenpo(gekkyu);
  const kenpo = Math.round(h * (SHAHO_R8.kenpo + SHAHO_R8.kodomo + (over40 ? SHAHO_R8.kaigo : 0)) / 200);
  const nenkin = Math.round(hyojunNenkin(gekkyu) * SHAHO_R8.nenkin / 200);
  const koyo = Math.round(gekkyu * SHAHO_R8.koyo / 100);
  return { hyojun: h, kenpo, nenkin, koyo, total: kenpo + nenkin + koyo };
}
/* 賞与なし・扶養なし・2026年分の所得税と住民税(均等割5,000円)で見た、月の手取り */
function tedoriMonthly(gekkyu, over40) {
  const s = shahoMonthly(gekkyu, over40);
  const gokei = kyuyoShotoku(gekkyu * 12, 9), shakai = s.total * 12;
  const shotoku = shotokuzeiTotal(Math.max(0, gokei - shakai - kisoKojo(gokei, 2026)));
  const jumin = Math.floor(Math.max(0, gokei - shakai - 430000) * 0.1 / 100) * 100 + (gokei > 450000 ? 5000 : 0);
  return { shaho: s.total, shotoku: Math.round(shotoku / 12), jumin: Math.round(jumin / 12),
    tedori: gekkyu - s.total - Math.round((shotoku + jumin) / 12) };
}

/* ---------- 7. 産休・育休でもらえるお金 ---------- */
/* 休業開始時賃金日額の上限・下限(令和8年8月1日〜令和9年7月31日。厚労省「育児休業等給付の内容と支給申請手続」令和8年8月1日改訂版) */
const IKUKYU_R8 = { max: 16540, min: 3203 };
const SHUSSAN_ICHIJIKIN = 500000; // 出産育児一時金(産科医療補償制度に入っていない医療機関は48.8万円)
/* 日付は "YYYY-MM-DD"。UTC の時刻で日を数える(toISOString は使わない) */
const DAY_MS = 86400000;
const parseYmd = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const ymdOf = (t) => { const d = new Date(t); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const fmtYmd = (t) => { const [y, m, d] = ymdOf(t); return `${y}年${m}月${d}日`; };
/* nか月後の応当日(無い日は月末) */
function addMonthsUTC(t, n) {
  const [y, m, d] = ymdOf(t);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return Date.UTC(y, m - 1 + n, Math.min(d, last));
}
const monthIndex = (t) => { const [y, m] = ymdOf(t); return y * 12 + m - 1; };

/* 出産手当金。標準報酬月額÷30 は10円未満四捨五入、×2/3 は1円未満四捨五入(協会けんぽ)。期間は予定日どおりに生まれた場合 */
function shussanTeate(gekkyu, tatai) {
  const hyojun = hyojunKenpo(gekkyu);
  const daily = Math.round(Math.round(hyojun / 30 / 10) * 10 * 2 / 3);
  const days = (tatai ? 98 : 42) + 56;
  return { hyojun, daily, days, total: daily * days };
}

/* 育児休業給付金(出生時育児休業給付金を含む)。支給単位期間は休業開始日から1か月ごとで、休業を最後まで含む期間は30日、
 * 最後の期間は実日数。通算180日までは67%、181日目から50% */
function ikukyuPeriods(wageDay, start, end) {
  const out = [];
  let used = 0;
  for (let k = 0; ; k++) {
    const ps = addMonthsUTC(start, k);
    if (ps > end) break;
    const pe = addMonthsUTC(start, k + 1) - DAY_MS;
    const days = pe <= end ? 30 : Math.round((end - ps) / DAY_MS) + 1;
    const d67 = Math.max(0, Math.min(days, 180 - used));
    const amount67 = Math.floor(wageDay * d67 * 0.67), amount50 = Math.floor(wageDay * (days - d67) * 0.5);
    out.push({ from: ps, to: Math.min(pe, end), days, d67, amount67, amount50, amount: amount67 + amount50 });
    used += days;
  }
  return out;
}

/* v = { role: "mama"|"papa", due, gekkyu, over40, kenpo(勤務先の健康保険・厚生年金に加入), tatai, until: "1y"|"18m"|"2y"|"days"|"none", days, spouse14 } */
function sankyuIkukyu(v) {
  const birth = parseYmd(v.due);
  const mama = v.role !== "papa";
  const wageDay = Math.min(IKUKYU_R8.max, Math.max(IKUKYU_R8.min, Math.floor((v.gekkyu || 0) * 6 / 180)));
  const r = { birth, mama, wageDay, ichijikin: SHUSSAN_ICHIJIKIN };
  if (mama) {
    r.sanzenFrom = birth - ((v.tatai ? 98 : 42) - 1) * DAY_MS;
    r.sangoTo = birth + 56 * DAY_MS;
    r.teate = v.kenpo ? shussanTeate(v.gekkyu || 0, v.tatai) : null;
  }
  const start = mama ? birth + 57 * DAY_MS : birth;
  let legalEnd = null; // 育休の終わり(子が◯歳に達する日)。給付はその前日まで
  if (v.until === "1y") legalEnd = addMonthsUTC(birth, 12) - DAY_MS;
  else if (v.until === "18m") legalEnd = addMonthsUTC(birth, 18) - DAY_MS;
  else if (v.until === "2y") legalEnd = addMonthsUTC(birth, 24) - DAY_MS;
  else if (v.until === "days" && v.days > 0) legalEnd = start + (v.days - 1) * DAY_MS;
  const kyufuEnd = legalEnd == null ? null : v.until === "days" ? legalEnd : legalEnd - DAY_MS;
  r.ikukyu = null;
  if (kyufuEnd != null && kyufuEnd >= start) {
    const periods = ikukyuPeriods(wageDay, start, kyufuEnd);
    const total = periods.reduce((a, p) => a + p.amount, 0);
    const days = Math.round((kyufuEnd - start) / DAY_MS) + 1;
    /* 出生後休業支援給付金: ママは出生から16週、パパは8週の間に14日以上。ママは配偶者の14日以上の育休(または配偶者が会社員でない等)も要る */
    const winEnd = birth + (mama ? 112 : 56) * DAY_MS;
    const inWin = Math.max(0, Math.round((Math.min(kyufuEnd, winEnd) - start) / DAY_MS) + 1);
    const shienOk = inWin >= 14 && (mama ? !!v.spouse14 : true);
    const shien = shienOk ? Math.floor(wageDay * Math.min(28, inWin) * 0.13) : 0;
    /* 67%が終わる日(通算180日目)。支給単位期間の途中で切り替わるときは、その期間の初日から数える */
    const last67 = periods.filter((p) => p.d67 > 0).pop();
    const end67 = last67.d67 === last67.days ? last67.to : last67.from + (last67.d67 - 1) * DAY_MS;
    r.ikukyu = { start, end: kyufuEnd, legalEnd, days, periods, total, end67,
      total67: periods.reduce((a, p) => a + p.amount67, 0), total50: periods.reduce((a, p) => a + p.amount50, 0),
      shien, shienDays: shienOk ? Math.min(28, inWin) : 0,
      month67: Math.floor(wageDay * 30 * 0.67), month50: Math.floor(wageDay * 30 * 0.5) };
  }
  /* 社会保険料の免除: 休業を始めた月から、休業が終わった日の翌日の月の前月まで。同じ月の中だけの育休は14日以上で1か月 */
  const shaho = shahoMonthly(v.gekkyu || 0, v.over40);
  const exFrom = mama && v.kenpo ? r.sanzenFrom : r.ikukyu ? start : null;
  const exTo = r.ikukyu ? r.ikukyu.legalEnd : mama ? r.sangoTo : null;
  let months = 0;
  if (v.kenpo && exFrom != null && exTo != null) {
    months = monthIndex(exTo + DAY_MS) - monthIndex(exFrom);
    if (months === 0 && Math.round((exTo - exFrom) / DAY_MS) + 1 >= 14) months = 1;
  }
  r.menjo = { months, monthly: shaho.kenpo + shaho.nenkin, total: months * (shaho.kenpo + shaho.nenkin) };
  r.tedori = tedoriMonthly(v.gekkyu || 0, v.over40);
  r.total = (r.teate ? r.teate.total : 0) + (r.ikukyu ? r.ikukyu.total + r.ikukyu.shien : 0);
  return r;
}

/* ---------- 8. 児童手当(2024年10月分から。こども家庭庁) ---------- */
const JIDO_R6 = { u3: 15000, o3: 10000, dai3: 30000 };
const JIDO_FROM = 2024 * 12 + 9; // 2024年10月分。それより前は旧制度(所得制限あり・第3子以降は小学生まで)なので数えない
/* age 歳に達する日(誕生日の前日)以後の最初の3月31日の月 */
function fiscalEndMonth(birth, age) {
  const [y, m, d] = ymdOf(birth);
  const reach = Date.UTC(y + age, m - 1, d) - DAY_MS;
  const [ry] = ymdOf(reach);
  return (reach <= Date.UTC(ry, 2, 31) ? ry : ry + 1) * 12 + 2;
}
/* children = [{ birth: "YYYY-MM-DD" }]。futan は高校卒業後〜22歳の年度末の子の費用を親が負担しているか(第3子の数え方に入る)
 * 出生の翌月分から、18歳の年度末(3月)分まで。3歳の誕生月までは1.5万円。第3子以降は3万円 */
function jidoTeate(children, futan) {
  const kids = children.map((c, i) => {
    const b = parseYmd(c.birth), [y, m] = ymdOf(b);
    return { i, b, bm: y * 12 + m - 1, u3: (y + 3) * 12 + m - 1, end18: fiscalEndMonth(b, 18), end22: fiscalEndMonth(b, 22) };
  }).sort((a, b) => a.b - b.b || a.i - b.i);
  if (!kids.length) return { months: [], kids: [] };
  const from = Math.max(JIDO_FROM, Math.min(...kids.map((k) => k.bm + 1))), to = Math.max(...kids.map((k) => k.end18));
  const months = [];
  const per = kids.map(() => ({ total: 0, byMonth: {} }));
  for (let M = from; M <= to; M++) {
    const counted = kids.filter((k) => k.bm <= M && M <= k.end22 && (M <= k.end18 || futan));
    let sum = 0;
    kids.forEach((k, j) => {
      if (M < k.bm + 1 || M > k.end18) return;
      const rank = counted.indexOf(k) + 1;
      const amt = rank >= 3 ? JIDO_R6.dai3 : M <= k.u3 ? JIDO_R6.u3 : JIDO_R6.o3;
      per[j].total += amt; per[j].byMonth[M] = amt; sum += amt;
    });
    months.push({ M, sum });
  }
  return { from, to, months, kids: kids.map((k, j) => ({ index: k.i, birth: k.b, start: Math.max(JIDO_FROM, k.bm + 1), end: k.end18,
    partial: k.bm + 1 < JIDO_FROM, total: per[j].total, byMonth: per[j].byMonth })) };
}

/* ---------- 9. 児童扶養手当(令和8年4月分から。奈良県「児童扶養手当のしおり」令和8年度版) ---------- */
/* 月額 [全部支給, 一部支給の上限, 一部支給の下限, 係数]。毎年4月に物価スライドで変わる */
const FUYO_R8 = {
  hon: [48050, 48040, 11340, 0.0264029],   // 児童1人目
  ka: [11350, 11340, 5680, 0.0040719],     // 2人目以降の加算(1人につき)
};
/* 本人の所得制限限度額(扶養0人)。扶養1人につき38万円、70歳以上の同一生計配偶者・老人扶養は1人10万円、
 * 特定扶養親族と16〜18歳の扶養親族は1人15万円を足す。扶養義務者(同居の父母など)は別の表 */
const FUYO_LIMIT = { zenbu: 690000, ichibu: 2080000, gimu: 2360000, per: 380000, rojin: 100000, tokutei: 150000, gimuRojin: 60000 };
const round10 = (x) => Math.round(x / 10) * 10;

/* 扶養義務者(同じ家計の父母・祖父母・きょうだいなど)。1人ずつ判定し、合算しない。所得が限度額以上だと手当は全部止まる
 * 所得 = 給与所得＋公的年金の所得 −10万円 ＋ 事業などの所得 −8万円 −諸控除(ひとり親控除・寡婦控除も引ける)
 * 限度額 = 236万円 ＋ 38万円×扶養親族等の数 ＋ 6万円×老人扶養親族の数(扶養が老人扶養親族だけなら1人を除く)
 * 施行令2条の4第7項・4条。所得金額調整控除は使わない(給与所得と年金の所得の合計から10万円を引く決まりのため)
 * g = { kyuyo, nenkin, over65, sonota, kojo, fuyo(扶養親族等の数・配偶者を含む), rojin(うち70歳以上の扶養親族・配偶者を除く) } */
function fuyoGimu(g, year) {
  const kn = kyuyoShotoku(g.kyuyo || 0, year >= 2026 ? 9 : 8) + nenkinShotoku(g.nenkin || 0, !!g.over65);
  const shotoku = Math.max(0, Math.max(0, kn - 100000) + Math.max(0, g.sonota || 0) - 80000 - Math.max(0, g.kojo || 0));
  const fuyo = Math.max(0, g.fuyo || 0), rojin = Math.min(Math.max(0, g.rojin || 0), fuyo);
  const limit = FUYO_LIMIT.gimu + FUYO_LIMIT.per * fuyo + FUYO_LIMIT.gimuRojin * Math.max(0, rojin - (rojin > 0 && rojin === fuyo ? 1 : 0));
  return { shotoku, limit, stop: shotoku >= limit, margin: limit - shotoku };
}
/* 扶養義務者の収入(field は "kyuyo" か "nenkin")が、手当を止めない最大の額。ほかの収入はそのままで計算 */
function fuyoGimuMax(g, year, field) {
  const lim = fuyoGimu(g, year).limit;
  return maxIncome((x) => fuyoGimu(Object.assign({}, g, { [field]: x }), year).shotoku, lim - 1);
}

/* 手当の計算に使う所得 = 給与所得(・公的年金の所得 −10万円) ＋ その他の所得 ＋ 養育費の8割 − 8万円 − 諸控除。
 * year=2025 は令和7年中の所得(2026年11月〜2027年10月の手当)、2026 は令和8年中の所得
 * v = { year, kyuyo, sonota, youikuhi(年額), kojo(障害者控除・医療費控除など), kids(18歳の年度末までの子),
 *       kids16(そのうち16歳以上), other(ほかの扶養親族), otherTokutei(うち19〜22歳), otherRojin(うち70歳以上),
 *       gimu([扶養義務者の g, ...]。fuyoGimu を見る) } */
function jidoFuyo(v) {
  const kyuyoS = kyuyoShotoku(v.kyuyo || 0, v.year >= 2026 ? 9 : 8);
  const base = Math.max(0, kyuyoS - (kyuyoS > 0 ? 100000 : 0)) + Math.max(0, v.sonota || 0);
  const youiku = Math.round(Math.max(0, v.youikuhi || 0) * 0.8);
  const shotoku = Math.max(0, base + youiku - 80000 - Math.max(0, v.kojo || 0));
  const kids = Math.max(1, v.kids || 1);
  const fuyo = kids + Math.max(0, v.other || 0);
  const add = FUYO_LIMIT.per * fuyo + FUYO_LIMIT.tokutei * ((v.kids16 || 0) + (v.otherTokutei || 0)) + FUYO_LIMIT.rojin * (v.otherRojin || 0);
  const zenbu = FUYO_LIMIT.zenbu + add, ichibu = FUYO_LIMIT.ichibu + add;
  const gimu = (v.gimu || []).map((g) => fuyoGimu(g, v.year));
  let kind, hon = 0, ka = 0;
  if (gimu.some((g) => g.stop)) kind = "gimu";
  else if (shotoku < zenbu) { kind = "zenbu"; hon = FUYO_R8.hon[0]; ka = FUYO_R8.ka[0]; }
  else if (shotoku < ichibu) {
    kind = "ichibu";
    hon = FUYO_R8.hon[1] - round10((shotoku - zenbu) * FUYO_R8.hon[3]);
    ka = FUYO_R8.ka[1] - round10((shotoku - zenbu) * FUYO_R8.ka[3]);
  } else kind = "teishi";
  const monthly = hon + ka * (kids - 1);
  return { kyuyoS, youiku, shotoku, fuyo, zenbu, ichibu, kind, hon, ka, monthly, annual: monthly * 12, gimu };
}
/* 手当が全部支給・一部支給になる給与収入の上限(給与だけ・養育費なしのとき) */
function fuyoMaxKyuyo(v, which) {
  const lim = jidoFuyo(Object.assign({}, v, { kyuyo: 0 }))[which];
  return maxIncome((x) => jidoFuyo(Object.assign({}, v, { kyuyo: x })).shotoku, lim - 1);
}

if (typeof module !== "undefined") module.exports = {
  kyuyoShotoku, nenkinShotoku, gokeiShotoku, hikazeiLimit, shotokuwariLimit, hikazeiJudge, maxKyuyo, maxNenkin, maxIncome, HIKAZEI_SPECIAL,
  SHIEN_R8, shienRourei, yenRound,
  KYOKAI_R8, KYOKAI_KODOMO_R8, KYOKAI_KAIGO_R8, NINKEI_MAX_R8, hyojunHoshu, ninkeiPremium, KOKUHO_TOKYO23_R8, KOKUHO_KEIGEN_R8, kokuhoPremium,
  KOGAKU, KOGAKU_GAIRAI, KOGAKU_NENKAN_LOW_R8, kogakuLimit, kogakuCalc,
  kisoKojo, shotokuzei, shotokuzeiTotal, iryohiKojo, selfMedKojo, iryohiKojoEffect,
  hyojunKenpo, hyojunNenkin, SHAHO_R8, shahoMonthly, tedoriMonthly,
  IKUKYU_R8, SHUSSAN_ICHIJIKIN, parseYmd, ymdOf, fmtYmd, addMonthsUTC, shussanTeate, ikukyuPeriods, sankyuIkukyu,
  JIDO_R6, JIDO_FROM, fiscalEndMonth, jidoTeate,
  FUYO_R8, FUYO_LIMIT, round10, jidoFuyo, fuyoMaxKyuyo, fuyoGimu, fuyoGimuMax,
};
