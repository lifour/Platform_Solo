/**
 * parse_cbeta.js
 * 解析 CBETA TEI P5 XML (T48n2008 六祖大師法寶壇經 宗宝本)
 * 输出结构化 JSON → src/data/zongbao.json
 */
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const RAW_PATH = path.join(__dirname, '..', 'raw', 'T48n2008.xml');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'zongbao.json');

// 章节名映射（宗宝本十品）
const CHAPTER_NAMES = {
  '1 行由': { id: 'ch01', title: '行由品第一' },
  '2 般若': { id: 'ch02', title: '般若品第二' },
  '3 疑問': { id: 'ch03', title: '疑問品第三' },
  '4 定慧': { id: 'ch04', title: '定慧品第四' },
  '5 坐禪': { id: 'ch05', title: '坐禪品第五' },
  '6 懺悔': { id: 'ch06', title: '懺悔品第六' },
  '7 機緣': { id: 'ch07', title: '機緣品第七' },
  '8 頓漸': { id: 'ch08', title: '頓漸品第八' },
  '9 宣詔': { id: 'ch09', title: '宣詔品第九' },
  '10 付囑': { id: 'ch10', title: '付囑品第十' },
};

// ---- 主流程：正则方式直接解析 ----
function main() {
  const xml = fs.readFileSync(RAW_PATH, 'utf-8');

  // 只取 <body> 到 </body> 之间的内容
  const bodyMatch = xml.match(/<body>([\s\S]*?)<\/body>/);
  if (!bodyMatch) {
    console.error('找不到 <body> 标签');
    process.exit(1);
  }
  const body = bodyMatch[1];

  // 用 cb:mulu 定位每一品的起点
  const muluRegex = /<cb:mulu\s+level="1"\s+type="其他">([^<]+)<\/cb:mulu>/g;
  const chapters = [];
  const muluPositions = [];
  let m;
  while ((m = muluRegex.exec(body)) !== null) {
    const muluText = m[1].trim();
    if (CHAPTER_NAMES[muluText]) {
      muluPositions.push({
        ...CHAPTER_NAMES[muluText],
        startIndex: m.index,
      });
    }
  }

  // 确定每品的文本范围
  for (let i = 0; i < muluPositions.length; i++) {
    const start = muluPositions[i].startIndex;
    const end = i + 1 < muluPositions.length
      ? muluPositions[i + 1].startIndex
      : body.indexOf('<cb:div type="w">'); // 附录前截止
    const chunkRaw = body.slice(start, end > 0 ? end : undefined);
    const paragraphs = extractParagraphs(chunkRaw);

    chapters.push({
      id: muluPositions[i].id,
      title: muluPositions[i].title,
      paragraphs,
    });
  }

  const result = {
    title: '六祖大師法寶壇經',
    edition: '宗寶本',
    source: 'CBETA T48n2008',
    chapters,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`✅ 输出 ${OUT_PATH}`);
  console.log(`   共 ${chapters.length} 品`);
  chapters.forEach(ch => {
    const charCount = ch.paragraphs.reduce((s, p) => s + p.text.length, 0);
    console.log(`   ${ch.title}: ${ch.paragraphs.length} 段, ${charCount} 字`);
  });
}

/**
 * 从一品的 XML 片段中提取段落
 */
function extractParagraphs(chunk) {
  const paragraphs = [];
  // 匹配 <p ...>...</p> 标签对
  const pRegex = /<p\s+xml:id="([^"]*)"[^>]*>([\s\S]*?)(?:<\/p>)/g;
  let pm;
  while ((pm = pRegex.exec(chunk)) !== null) {
    const rawId = pm[1];
    const rawContent = pm[2];
    const text = cleanText(rawContent);
    if (text.length > 0) {
      paragraphs.push({
        id: rawId,
        text,
      });
    }
  }
  return paragraphs;
}

/**
 * 去除 XML 标签、合并行断，保留纯经文文本
 */
function cleanText(raw) {
  let text = raw;
  // 移除 <lb .../> 行号标签
  text = text.replace(/<lb[^>]*\/>/g, '');
  // 移除 <pb .../> 页码标签
  text = text.replace(/<pb[^>]*\/>/g, '');
  // 移除 <anchor .../> 标签
  text = text.replace(/<anchor[^>]*\/>/g, '');
  // 处理 <note place="inline">...</note> → 括号保留注释内容
  text = text.replace(/<note\s+place="inline">([\s\S]*?)<\/note>/g, '（$1）');
  // 移除其他 <note ...>...</note>
  text = text.replace(/<note[^>]*>[\s\S]*?<\/note>/g, '');
  // 处理 <lg> 和 <l> 偈颂标签
  text = text.replace(/<lg[^>]*>/g, '');
  text = text.replace(/<\/lg>/g, '');
  text = text.replace(/<l[^>]*>/g, '');
  text = text.replace(/<\/l>/g, '');
  // 移除 <head>...</head>
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/g, '');
  // 移除 <cb:mulu ...>...</cb:mulu>
  text = text.replace(/<cb:mulu[^>]*>[\s\S]*?<\/cb:mulu>/g, '');
  // 移除 <cb:juan ...>...</cb:juan>
  text = text.replace(/<cb:juan[^>]*>[\s\S]*?<\/cb:juan>/g, '');
  // 移除所有其余 XML 标签
  text = text.replace(/<[^>]+>/g, '');
  // 移除 XML 实体
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  // 合并空白（换行等）
  text = text.replace(/\s+/g, '');
  return text.trim();
}

main();
