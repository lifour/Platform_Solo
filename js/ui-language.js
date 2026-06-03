/**
 * ui-language.js — 简体↔繁体转换 + UI 字符串
 */

// ---- 简体→繁体映射 ----
const _s2tMap = (() => {
  const pairs =
    '爱愛碍礙罢罷备備笔筆边邊变變标標别別宾賓补補参參残殘惭慚惨慘仓倉层層产產长長尝嘗偿償厂廠车車彻徹陈陳称稱诚誠惩懲迟遲冲衝丑醜处處触觸辞辭从從达達带帶担擔当當导導灯燈敌敵递遞点點电電调調东東动動独獨断斷对對队隊夺奪尔爾发發范範飞飛坟墳奋奮丰豐风風凤鳳肤膚妇婦复復赶趕个個给給宫宮贡貢沟溝构構购購顾顧关關观觀广廣归歸龟龜国國过過还還汉漢号號轰轟后後护護划劃华華画畫怀懷坏壞欢歡环環换換黄黃汇匯会會获獲击擊鸡雞积積极極际際继繼夹夾荐薦坚堅间間见見将將奖獎讲講酱醬节節杰傑尽盡进進惊驚经經净淨竞競举舉据據觉覺军軍开開垦墾恳懇夸誇块塊来來兰蘭拦攔蓝藍劳勞乐樂类類离離历歷丽麗两兩灵靈领領刘劉龙龍楼樓虑慮录錄陆陸驴驢乱亂论論罗羅马馬买買卖賣满滿门門闷悶梦夢庙廟灭滅鸣鳴难難恼惱脑腦拟擬酿釀鸟鳥宁寧农農欧歐盘盤赔賠喷噴骗騙贫貧凭憑仆僕朴樸启啟气氣迁遷签簽钱錢枪槍亲親穷窮请請庆慶权權劝勸确確让讓热熱认認荣榮赛賽伞傘丧喪扫掃杀殺晒曬伤傷赏賞烧燒设設审審声聲胜勝圣聖师師时時实實识識势勢释釋寿壽书書属屬术術树樹双雙丝絲苏蘇诉訴虽雖随隨岁歲孙孫损損态態叹歎谈談汤湯讨討体體条條听聽铁鐵厅廳头頭图圖团團万萬网網为為韦韋卫衛稳穩问問无無务務雾霧误誤习習鲜鮮显顯宪憲乡鄉响響协協胁脅写寫兴興须須选選学學训訓压壓亚亞烟煙严嚴颜顏验驗阳陽样樣养養摇搖药藥业業叶葉页頁医醫仪儀忆憶义義艺藝阴陰银銀饮飲应應拥擁邮郵犹猶鱼魚与與语語郁鬱誉譽渊淵远遠愿願约約阅閱运運杂雜脏臟暂暫则則责責贼賊赠贈斋齋战戰张張针針阵陣争爭证證纸紙质質种種众眾专專转轉装裝壮壯状狀资資总總纵縱组組钻鑽缘緣禅禪诸諸谓謂诲誨蕴蘊顿頓说說烦煩忏懺诵誦谛諦颂頌辩辯坛壇岭嶺宝寶尘塵刹剎闻聞谤謗悯憫怜憐惫憊赞讚恒恆诫誡谱譜筹籌绝絕忧憂迹跡';
  const m = {};
  for (let i = 0; i < pairs.length; i += 2) {
    const s = pairs[i], t = pairs[i + 1];
    if (s !== t) m[s] = t;
  }
  return m;
})();

// ---- 繁→简映射（由 _s2tMap 反转） ----
const _t2sMap = Object.fromEntries(Object.entries(_s2tMap).map(([s, t]) => [t, s]));

export function toTraditional(str) {
  let out = '';
  for (const ch of str) out += _s2tMap[ch] || ch;
  return out;
}

export function toSimplified(str) {
  let out = '';
  for (const ch of str) out += _t2sMap[ch] || ch;
  return out;
}

/**
 * 仅转换 DOM 文本节点（保留属性值，如 data-term 保持繁体供词典匹配）
 */
export function applySimplifiedToContainer(el) {
  if (!el) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { node.textContent = toSimplified(node.textContent); });
}

// ---- UI 字符串（简体原版） ----
export const UI_STRINGS = {
  topbarTitle: '六祖坛经',
  actionsBtnText: '⚙',
  actionsBtnTitle: '操作',
  compareBtnText: '对照',
  compareBtnTitle: '敦煌本对照',
  pinyinBtnText: '注音',
  pinyinBtnTitle: '拼音注音',
  downloadBtnText: '下载',
  downloadBtnTitle: '下载宗宝本',
  settingsBtnText: '设置',
  searchPlaceholder: '搜经文…',
  sidePanelTitle: '目录 & 搜索',
  mobileSearchPlaceholder: '搜经文…',
  mobileChapterHeading: '目录',
  settingsTitle: '设置',
  displayModeScroll: '滑动显示',
  displayModePaged: '翻页显示',
  settingsReset: '恢复默认',
  compareModeLabel: '启用对照（敦煌本 vs 宗宝本）',
  chapterPlaceholder: '— 选品 —',
  notesBtnText: '笔记',
  notesPanelTitle: '笔记',
  notesEmpty: '暂无笔记。',
  selectionNote: '笔记',
  selectionLookup: '查字',
  selectionCancel: '取消',
};
