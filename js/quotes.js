/**
 * quotes.js — 每日一语（坛经经典语录）
 */

const QUOTES = [
  {
    text: '菩提本无树，明镜亦非台，本来无一物，何处惹尘埃。',
    annotation: '惠能针对神秀偈所作，直示自性空寂、本来清净。无一物可得，何处来尘埃？这是六祖顿悟法门的根本见地。',
    source: '行由品第一',
  },
  {
    text: '不是风动，不是幡动，仁者心动。',
    annotation: '六祖初出茅庐的著名机锋。风与幡皆外境，真正在动的是你的心。一切万法不离自性，心外无法。',
    source: '行由品第一',
  },
  {
    text: '何期自性，本自清净；何期自性，本不生灭；何期自性，本自具足；何期自性，本无动摇；何期自性，能生万法。',
    annotation: '惠能闻《金刚经》大悟后连说五个"何期"，道尽自性的本来面目：清净、不生不灭、本自具足、不动摇、能生万法。这是禅宗见性的究竟境界。',
    source: '行由品第一',
  },
  {
    text: '人虽有南北，佛性本无南北。',
    annotation: '五祖嫌惠能是岭南"猎獠"，惠能以此回答。佛性平等，不分地域贵贱，这是禅宗人人平等、直指本心的精神。',
    source: '行由品第一',
  },
  {
    text: '迷时师度，悟了自度。',
    annotation: '五祖送惠能过江时，惠能请师坐船，五祖说"合是吾渡汝"，惠能以此回答。迷时需要善知识指引，悟了只能自己度自己。',
    source: '行由品第一',
  },
  {
    text: '凡夫即佛，烦恼即菩提。',
    annotation: '凡夫与佛本无二体，烦恼与菩提性本不二。迷则凡夫烦恼，悟则佛即菩提。转迷成悟，不假外求。',
    source: '般若品第二',
  },
  {
    text: '一切万法，不离自性。',
    annotation: '六祖大悟时所说。万法皆是自性所现，离开自性别无佛法。学佛的根本是识自本心、见自本性。',
    source: '行由品第一',
  },
  {
    text: '若识自本心，见自本性，即名丈夫、天人师、佛。',
    annotation: '五祖印证惠能之语。识心见性即是佛，不在于外相、不在于形式。这是禅宗"直指人心，见性成佛"的根本依据。',
    source: '行由品第一',
  },
  {
    text: '外离相为禅，内不乱为定。',
    annotation: '六祖对禅定的重新定义。不是枯坐不动叫禅定，而是外不执着任何形相、内心始终保持不散乱，行住坐卧皆是禅定。',
    source: '坐禅品第五',
  },
  {
    text: '佛法在世间，不离世间觉。出世觅菩提，犹如求兔角。',
    annotation: '佛法就在日常世间中，离开世间去求觉悟，就像寻找兔子的角一样不可能。修行就在当下，在日用平常中。',
    source: '般若品第二',
  },
  {
    text: '应无所住而生其心。',
    annotation: '这是惠能闻《金刚经》开悟的关键句。心不执着于任何境界——不执着善、不执着恶、不执着空——而清净妙用自然生起。',
    source: '行由品第一',
  },
  {
    text: '不思善，不思恶，正与么时，那个是明上座本来面目？',
    annotation: '六祖教惠明见性的方法。超越善恶对立的思维，当下一念回光返照，就能见到自己本来的面目。这是直指人心的典型禅机。',
    source: '行由品第一',
  },
  {
    text: '定是慧体，慧是定用。犹如灯光，有灯即光，无灯即暗。',
    annotation: '六祖以灯与光的比喻说明定慧一体。不是先定后慧，而是定慧同时，体用不二。有定就有慧，有慧就有定。',
    source: '定慧品第四',
  },
  {
    text: '无念为宗，无相为体，无住为本。',
    annotation: '六祖禅法的三大纲领。无念不是没有念头，而是念而无住；无相不是没有形相，而是离相；无住则念念不停留，自然解脱。',
    source: '定慧品第四',
  },
  {
    text: '前念不生即心，后念不灭即佛。',
    annotation: '不追忆过去已生的念头即是心，不压制未来将生的念头即是佛。心佛就在当前这一念的觉悟中。',
    source: '般若品第二',
  },
  {
    text: '见性是功，平等是德。',
    annotation: '六祖对梁武帝「造寺度僧有何功德」的解答。真正见性才是功，视一切众生平等才是德。不是外在的布施供养，而是内在的觉悟与平等心。',
    source: '疑问品第三',
  },
  {
    text: '心地无非自性戒，心地无痴自性慧，心地无乱自性定。',
    annotation: '六祖以心地三无解释戒定慧。心中不起是非即是自性戒，心中没有愚痴即是自性慧，心中保持不乱即是自性定。戒定慧不在外求。',
    source: '般若品第二',
  },
  {
    text: '若能不见他人是非，即见自性。',
    annotation: '不见他人是非，不是装看不见，而是内心真正不对立分别。能如此，则自性自然显现。',
    source: '般若品第二',
  },
  {
    text: '一切即一，一即一切。',
    annotation: '一与一切圆融无碍。一法含摄万法，万法不出一心。这是华严"一即一切"的思想在坛经中的体现。',
    source: '般若品第二',
  },
  {
    text: '各自观心，自见本性。',
    annotation: '六祖最直接的教导。不必外求，各自回光返照，观照自心。能如此，自然见到自己的本来面目。',
    source: '般若品第二',
  },
  {
    text: '苦口的是良药，逆耳必是忠言。改过必生智慧，护短心内非贤。',
    annotation: '六祖教人修行要虚心接受批评。能听逆耳之言才能改过，改过则智慧生。维护自己的短处不是真修行人。',
    source: '般若品第二',
  },
  {
    text: '若能自有真，离假即心真。自心不离假，无真何处真。',
    annotation: '离开虚妄即是真实。你的心若不执着虚妄，当下就是真心。不需要另外去找一个真。',
    source: '般若品第二',
  },
];

let shownIndices = [];

/**
 * 显示随机经典语录
 */
function getDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${y}年${m}月${day}日 星期${weekdays[d.getDay()]}`;
}

export function showRandomQuote() {
  const card = document.getElementById('quote-card');
  const overlay = document.getElementById('quote-overlay');
  const dateEl = document.getElementById('quote-date');
  const textEl = document.getElementById('quote-text');
  const annoEl = document.getElementById('quote-annotation');
  const sourceEl = document.getElementById('quote-source');

  if (!card || !textEl) return;
  if (dateEl) dateEl.textContent = getDateStr();

  // 重置已展示记录
  if (shownIndices.length >= QUOTES.length) shownIndices = [];

  // 从未展示的中随机选一条
  let available = QUOTES.map((_, i) => i).filter(i => !shownIndices.includes(i));
  if (available.length === 0) available = QUOTES.map((_, i) => i);

  const idx = available[Math.floor(Math.random() * available.length)];
  shownIndices.push(idx);

  const quote = QUOTES[idx];
  textEl.textContent = quote.text;
  annoEl.textContent = '—— ' + quote.annotation;
  sourceEl.textContent = '—— 摘自《六祖坛经》' + quote.source;

  card.hidden = false;
  if (overlay) overlay.hidden = false;
}

/**
 * 关闭语录弹窗
 */
export function closeQuoteCard() {
  const card = document.getElementById('quote-card');
  const overlay = document.getElementById('quote-overlay');
  if (card) card.hidden = true;
  if (overlay) overlay.hidden = true;
}
