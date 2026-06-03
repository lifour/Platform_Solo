/**
 * parse_koan.js — 解析 CBETA 公案 XML (无门关/碧岩录/从容录)
 * 用法: node scripts/parse_koan.js <xml文件> <输出json> [起始编号]
 *
 * 输出格式与 zongbao.json 一致:
 * { title, edition, source, chapters: [{ id, title, paragraphs: [{ id, text }] }] }
 */
const fs = require('fs');
const path = require('path');

const xmlPath = path.resolve(process.argv[2]);
const outPath = path.resolve(process.argv[3]);
const toSimplified = process.argv.includes('--simplified');
const startNum = parseInt(
  process.argv.filter(a => /^\d+$/.test(a))[0] || '1', 10
);

function main() {
  const xml = fs.readFileSync(xmlPath, 'utf-8');

  // 提取书名和来源
  let title = '未知';
  const titleCN = xml.match(/<title\s+level="m"[^>]*>([^<]+)<\/title>/);
  if (titleCN) title = titleCN[1].trim();
  if (!title || title === '未知') {
    const titleRaw = xml.match(/<title>[^<]*(無門關|碧巖錄|從容錄|禪宗)[^<]*<\/title>/);
    if (titleRaw) title = titleRaw[0].replace(/<[^>]+>/g, '').replace(/^[^)]+\)/, '').trim();
  }
  const idMatch = xml.match(/<idno[^>]*>([^<]+)<\/idno>/);
  const source = idMatch ? 'CBETA ' + idMatch[1] : 'CBETA';

  // 取 <body>
  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/);
  if (!bodyMatch) { console.error('找不到 <body>'); process.exit(1); }
  const body = bodyMatch[1];

  // 按 <cb:div type="other"> 切分章节
  const chapterRegex = /<cb:div\s+type="other">([\s\S]*?)<\/cb:div>/g;
  const chapters = [];
  let idx = startNum;

  let m;
  while ((m = chapterRegex.exec(body)) !== null) {
    const content = m[1];

    // 跳过目录
    if (/目錄/.test(content)) continue;

    // 提取标题
    const headMatch = content.match(/<head[^>]*>([\s\S]*?)<\/head>/);
    if (!headMatch) continue;
    const rawTitle = cleanText(headMatch[1]);
    if (!rawTitle) continue;

    // 编号
    const numStr = String(idx).padStart(2, '0');
    const caseTitle = `第${toChinese(idx)}則 ${rawTitle}`;

    // 提取段落
    const paragraphs = [];
    const pRegex = /<p\s+xml:id="([^"]*)"[^>]*>([\s\S]*?)(?:<\/p>)/g;
    let pm;
    while ((pm = pRegex.exec(content)) !== null) {
      const text = cleanText(pm[2]);
      if (text.length > 0) {
        paragraphs.push({ id: pm[1], text });
      }
    }

    // 提取偈颂 <lg> (若上面没抓到)
    const lgRegex = /<lg[^>]*>([\s\S]*?)<\/lg>/g;
    let lm;
    while ((lm = lgRegex.exec(content)) !== null) {
      const text = cleanText(lm[1]);
      if (text.length > 0) {
        // 避免与已提取的段落重复
        const isDup = paragraphs.some(p => p.text.includes(text.slice(0, 10)));
        if (!isDup) {
          paragraphs.push({ id: `lg_${numStr}_${paragraphs.length}`, text });
        }
      }
    }

    if (paragraphs.length === 0) continue;

    chapters.push({
      id: `case_${numStr}`,
      title: caseTitle,
      paragraphs,
    });

    idx++;
  }

  const result = {
    title,
    edition: 'CBETA',
    source,
    chapters,
  };

  // 繁→简转换
  if (toSimplified) {
    simplifyResult(result);
  }

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`✅ 输出 ${outPath}`);
  console.log(`   标题: ${title}`);
  console.log(`   共 ${chapters.length} 则`);
  chapters.forEach(ch => {
    const charCount = ch.paragraphs.reduce((s, p) => s + p.text.length, 0);
    console.log(`   ${ch.title}: ${ch.paragraphs.length} 段, ${charCount} 字`);
  });
}

function toChinese(n) {
  const units = '零一二三四五六七八九';
  if (n <= 10) return n === 10 ? '十' : units[n];
  if (n < 20) return '十' + units[n % 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return units[tens] + '十' + (ones > 0 ? units[ones] : '');
}

// ---- 繁→简转换 ----
const _s2tPairs =
  '爱愛碍礙罢罷备備笔筆边邊变變标標别別宾賓补補参參残殘惭慚惨慘仓倉层層产產长長尝嘗偿償厂廠车車彻徹陈陳称稱诚誠惩懲迟遲冲衝丑醜处處触觸辞辭从從达達带帶担擔当當导導灯燈敌敵递遞点點电電调調东東动動独獨断斷对對队隊夺奪尔爾发發范範飞飛坟墳奋奮丰豐风風凤鳳肤膚妇婦复復赶趕个個给給宫宮贡貢沟溝构構购購顾顧关關观觀广廣归歸龟龜国國过過还還汉漢号號轰轟后後护護划劃华華画畫怀懷坏壞欢歡环環换換黄黃汇匯会會获獲击擊鸡雞积積极極际際继繼夹夾荐薦坚堅间間见見将將奖獎讲講酱醬节節杰傑尽盡进進惊驚经經净淨竞競举舉据據觉覺军軍开開垦墾恳懇夸誇块塊来來兰蘭拦攔蓝藍劳勞乐樂类類离離历歷丽麗两兩灵靈领領刘劉龙龍楼樓虑慮录錄陆陸驴驢乱亂论論罗羅马馬买買卖賣满滿门門闷悶梦夢庙廟灭滅鸣鳴难難恼惱脑腦拟擬酿釀鸟鳥宁寧农農欧歐盘盤赔賠喷噴骗騙贫貧凭憑仆僕朴樸启啟气氣迁遷签簽钱錢枪槍亲親穷窮请請庆慶权權劝勸确確让讓热熱认認荣榮赛賽伞傘丧喪扫掃杀殺晒曬伤傷赏賞烧燒设設审審声聲胜勝圣聖师師时時实實识識势勢释釋寿壽书書属屬术術树樹双雙丝絲苏蘇诉訴虽雖随隨岁歲孙孫损損态態叹歎谈談汤湯讨討体體条條听聽铁鐵厅廳头頭图圖团團万萬网網为為韦韋卫衛稳穩问問无無务務雾霧误誤习習鲜鮮显顯宪憲乡鄉响響协協胁脅写寫兴興须須选選学學训訓压壓亚亞烟煙严嚴颜顏验驗阳陽样樣养養摇搖药藥业業叶葉页頁医醫仪儀忆憶义義艺藝阴陰银銀饮飲应應拥擁邮郵犹猶鱼魚与與语語郁鬱誉譽渊淵远遠愿願约約阅閱运運杂雜脏臟暂暫则則责責贼賊赠贈斋齋战戰张張针針阵陣争爭证證纸紙质質种種众眾专專转轉装裝壮壯状狀资資总總纵縱组組钻鑽缘緣禅禪诸諸谓謂诲誨蕴蘊顿頓说說烦煩忏懺诵誦谛諦颂頌辩辯坛壇岭嶺宝寶尘塵刹剎闻聞谤謗悯憫怜憐惫憊赞讚恒恆诫誡谱譜筹籌绝絕忧憂迹跡';
const _t2sMap = {};
for (let i = 0; i < _s2tPairs.length; i += 2) {
  _t2sMap[_s2tPairs[i + 1]] = _s2tPairs[i];
}
// 补充缺少的繁简映射
const _extraT2S = { '趙':'赵', '無':'无', '關':'关', '門':'门', '萬':'万', '雲':'云', '裏':'里', '幹':'干', '異':'异',餘:'余' };
Object.assign(_t2sMap, _extraT2S);

function toSimplifiedText(str) {
  let out = '';
  for (const ch of str) out += _t2sMap[ch] || ch;
  return out;
}

function simplifyResult(result) {
  result.title = toSimplifiedText(result.title);
  (result.chapters || []).forEach(ch => {
    ch.title = toSimplifiedText(ch.title);
    (ch.paragraphs || []).forEach(p => {
      p.text = toSimplifiedText(p.text);
    });
  });
}

function cleanText(raw) {
  let text = raw;
  // 行号标签
  text = text.replace(/<lb[^>]*\/>/g, '');
  text = text.replace(/<pb[^>]*\/>/g, '');
  text = text.replace(/<anchor[^>]*\/>/g, '');
  // 校勘注释（保留 inline 注释内容）
  text = text.replace(/<note\s+place="inline">([\s\S]*?)<\/note>/g, '（$1）');
  text = text.replace(/<note[^>]*>[\s\S]*?<\/note>/g, '');
  // 偈颂标签
  text = text.replace(/<lg[^>]*>/g, '');
  text = text.replace(/<\/lg>/g, '');
  text = text.replace(/<l[^>]*>/g, '');
  text = text.replace(/<\/l>/g, '');
  text = text.replace(/<caesura[^>]*\/>/g, '');
  // head, mulu
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/g, '');
  text = text.replace(/<cb:mulu[^>]*>[\s\S]*?<\/cb:mulu>/g, '');
  text = text.replace(/<cb:div[^>]*>[\s\S]*?<\/cb:div>/g, '');
  // app/lem/rdg 校勘
  text = text.replace(/<app[^>]*>[\s\S]*?<\/app>/g, '');
  text = text.replace(/<lem[^>]*>[\s\S]*?<\/lem>/g, '');
  text = text.replace(/<rdg[^>]*>[\s\S]*?<\/rdg>/g, '');
  // space
  text = text.replace(/<space[^>]*\/>/g, '');
  // 所有其余 XML 标签
  text = text.replace(/<[^>]+>/g, '');
  // XML 实体
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&quot;/g, '"');
  // 合并空白
  text = text.replace(/\s+/g, '');
  return text.trim();
}

main();
