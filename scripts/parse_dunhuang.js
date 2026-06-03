/**
 * parse_dunhuang.js
 * 下载并解析 CBETA TEI P5 XML (T48n2007 敦煌本六祖壇經)
 * 输出 → src/data/dunhuang.json
 *
 * 敦煌本按 "折" 分节 (共57折)，本脚本按内容映射到宗宝本十品。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const RAW_URL = 'https://raw.githubusercontent.com/cbeta-git/xml-p5a/master/T/T48/T48n2007.xml';
const RAW_PATH = path.join(__dirname, '..', 'raw', 'T48n2007.xml');
const OUT_PATH = path.join(__dirname, '..', 'data', 'dunhuang.json');

// 敦煌本"折"→宗宝本"品"映射
const FOLD_TO_CHAPTER = {
  // 行由品
  '第一折': 'ch01', '第二折': 'ch01', '第三折': 'ch01', '第四折': 'ch01',
  '第五折': 'ch01', '第六折': 'ch01', '第七折': 'ch01', '第八折': 'ch01',
  '第九折': 'ch01', '第十折': 'ch01', '第十一折': 'ch01', '第十二折': 'ch01',
  // 定慧品
  '第十三折': 'ch04', '第十四折': 'ch04',
  // 坐禅品
  '第十五折': 'ch05', '第十六折': 'ch05',
  // 無念無相無住 → 定慧品
  '第十七折': 'ch04', '第十八折': 'ch04', '第十九折': 'ch04',
  // 懺悔品
  '第二十折': 'ch06', '第二十一折': 'ch06', '第二十二折': 'ch06',
  '第二十三折': 'ch06', '第二十四折': 'ch06',
  // 般若品
  '第二十五折': 'ch02', '第二十六折': 'ch02', '第二十七折': 'ch02',
  '第二十八折': 'ch02', '第二十九折': 'ch02',
  // 般若品 + 頌
  '第三十折': 'ch02', '第三十一折': 'ch02', '第三十二折': 'ch02',
  '第三十三折': 'ch02', '第三十四折': 'ch02', '第三十五折': 'ch02',
  '第三十六折': 'ch02',
  // 告別 / 疑問品
  '第三十七折': 'ch03', '第三十八折': 'ch03', '第三十九折': 'ch03',
  // 頓漸品
  '第四十折': 'ch08', '第四十一折': 'ch08', '第四十二折': 'ch08',
  // 機緣品
  '第四十三折': 'ch07', '第四十四折': 'ch07',
  // 付囑品
  '第四十五折': 'ch10', '第四十六折': 'ch10', '第四十七折': 'ch10',
  '第四十八折': 'ch10', '第四十九折': 'ch10', '第五十折': 'ch10',
  '第五十一折': 'ch10', '第五十二折': 'ch10', '第五十三折': 'ch10',
  '第五十四折': 'ch10', '第五十五折': 'ch10', '第五十六折': 'ch10',
  '第五十七折': 'ch10',
};

const CHAPTER_TITLES = {
  ch01: '行由品第一', ch02: '般若品第二', ch03: '疑問品第三',
  ch04: '定慧品第四', ch05: '坐禪品第五', ch06: '懺悔品第六',
  ch07: '機緣品第七', ch08: '頓漸品第八', ch09: '宣詔品第九',
  ch10: '付囑品第十',
};

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function cleanText(raw) {
  let text = raw;
  // 1) 移除所有 <note> 标签及其内容 (包括校勘注释和参考文献)
  text = text.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '');
  // 2) 从 <app> 中取 <lem> 的文字内容（CBETA校正版），去掉 <lem> 内嵌的 <note>
  text = text.replace(/<app[^>]*>([\s\S]*?)<\/app>/g, (match, inner) => {
    const lemMatch = inner.match(/<lem[^>]*>([\s\S]*?)<\/lem>/);
    if (lemMatch) {
      let lemText = lemMatch[1];
      lemText = lemText.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '');
      lemText = lemText.replace(/<[^>]+>/g, '');
      return lemText;
    }
    return '';
  });
  // 3) 移除 <space> 标签
  text = text.replace(/<space[^>]*\/>/g, '');
  // 4) 移除所有剩余 XML 标签
  text = text.replace(/<[^>]+>/g, '');
  // 5) 清理空白
  text = text.replace(/\s+/g, '');
  return text.trim();
}

async function main() {
  // 下载 XML
  let xml;
  if (fs.existsSync(RAW_PATH)) {
    console.log('使用已缓存的 XML:', RAW_PATH);
    xml = fs.readFileSync(RAW_PATH, 'utf-8');
  } else {
    console.log('下载 CBETA XML...');
    xml = await download(RAW_URL);
    fs.mkdirSync(path.dirname(RAW_PATH), { recursive: true });
    fs.writeFileSync(RAW_PATH, xml, 'utf-8');
    console.log('已保存到:', RAW_PATH);
  }

  // 取 <body>
  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/);
  if (!bodyMatch) { console.error('找不到 <body>'); process.exit(1); }
  const body = bodyMatch[1];

  // 按 cb:mulu 切分折
  const muluRegex = /<cb:mulu\s+type="其他"\s+level="1">(第[^<]+折)<\/cb:mulu>/g;
  const foldPositions = [];
  let m;
  while ((m = muluRegex.exec(body)) !== null) {
    foldPositions.push({ name: m[1], start: m.index });
  }

  // 按章节聚合
  const chapterParas = {}; // ch01 → [{ id, text }]
  for (const chId of Object.keys(CHAPTER_TITLES)) {
    chapterParas[chId] = [];
  }

  for (let i = 0; i < foldPositions.length; i++) {
    const fold = foldPositions[i];
    const nextStart = i + 1 < foldPositions.length ? foldPositions[i + 1].start : body.length;
    const chunk = body.slice(fold.start, nextStart);
    const chId = FOLD_TO_CHAPTER[fold.name];
    if (!chId) continue;

    // 提取段落
    const pRegex = /<p\s+xml:id="([^"]*)"[^>]*>([\s\S]*?)(?:<\/p>)/g;
    let pm;
    while ((pm = pRegex.exec(chunk)) !== null) {
      const text = cleanText(pm[2]);
      if (text.length > 0) {
        chapterParas[chId].push({ id: pm[1], text });
      }
    }

    // 提取偈颂 <lg>
    const lgRegex = /<lg[^>]*>([\s\S]*?)<\/lg>/g;
    let lm;
    while ((lm = lgRegex.exec(chunk)) !== null) {
      const text = cleanText(lm[1]).replace(/，\s*/g, '，');
      if (text.length > 0) {
        chapterParas[chId].push({ id: `lg_${fold.name}_${chapterParas[chId].length}`, text });
      }
    }
  }

  // 开头部分（第一折之前）归入 ch01
  if (foldPositions.length > 0) {
    const prelude = body.slice(0, foldPositions[0].start);
    const pRegex = /<p\s+xml:id="([^"]*)"[^>]*>([\s\S]*?)(?:<\/p>)/g;
    let pm;
    const preParagraphs = [];
    while ((pm = pRegex.exec(prelude)) !== null) {
      const text = cleanText(pm[2]);
      if (text.length > 0) {
        preParagraphs.push({ id: pm[1], text });
      }
    }
    if (preParagraphs.length > 0) {
      chapterParas.ch01 = [...preParagraphs, ...chapterParas.ch01];
    }
  }

  // 构建输出
  const chapters = [];
  for (const [chId, title] of Object.entries(CHAPTER_TITLES)) {
    const paras = chapterParas[chId];
    if (paras.length > 0) {
      chapters.push({ id: chId, title, paragraphs: paras });
    }
  }

  const result = {
    title: '南宗頓教最上大乘摩訶般若波羅蜜經六祖惠能大師於韶州大梵寺施法壇經',
    edition: '敦煌本',
    source: 'CBETA T48n2007',
    chapters,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✅ 输出 ${OUT_PATH}`);
  console.log(`   共 ${chapters.length} 品（映射自敦煌本）`);
  let totalChars = 0;
  chapters.forEach(ch => {
    const charCount = ch.paragraphs.reduce((s, p) => s + p.text.length, 0);
    totalChars += charCount;
    console.log(`   ${ch.title}: ${ch.paragraphs.length} 段, ${charCount} 字`);
  });
  console.log(`   总字数: ${totalChars}`);
}

main().catch(err => { console.error(err); process.exit(1); });
