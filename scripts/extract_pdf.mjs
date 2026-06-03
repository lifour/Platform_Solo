import * as pdfjs from 'pdfjs-dist';
import fs from 'fs';

const buf = fs.readFileSync(process.argv[2]);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const doc = await pdfjs.getDocument({ data }).promise;

// 提取每页文本，保留分页标记
let fullText = '';
const pageTexts = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const text = tc.items.map(item => item.str).join('');
  pageTexts.push(text);
}
fullText = pageTexts.join('\n\n');

// 按章节分割
// 识别 "第一部分"、"第二部分" 等作为章节头
const chapterRegex = /(第[一二三四五六七八九十]+部分[：:][^\n]*)/g;
let chapters = [];
let lastIdx = 0;
let lastTitle = '全文';
let match;

// 先按章节分割
const sections = fullText.split(chapterRegex);
// sections[0] = 引言部分, sections[1] = 第一个标题, sections[2] = 内容...

let currentTitle = '引言';
let currentText = '';

for (let i = 0; i < sections.length; i++) {
  const s = sections[i].trim();
  if (!s) continue;

  if (chapterRegex.test(sections[i])) {
    // 保存前一个章节
    if (currentText) {
      chapters.push({ title: currentTitle, text: currentText });
    }
    currentTitle = s;
    currentText = '';
  } else {
    currentText += s;
  }
}
// 最后一个章节
if (currentText) {
  chapters.push({ title: currentTitle, text: currentText });
}

// 如果没有按章节分割成功（上面 regex 逻辑有问题是因为 test 会改变 lastIndex），重新处理
if (chapters.length <= 1) {
  chapters = [];
  currentTitle = '全文';
  currentText = sections.join('');

  // 按 "一、" "二、" "三、" 等常见中文章节标记分
  const cnRegex = /^[一二三四五六七八九十]+[、．\.][^\n]*/gm;
  const parts = fullText.split(/(?=[一二三四五六七八九十]+[、．\.])/);

  if (parts.length > 1) {
    parts.forEach((part, idx) => {
      const titleMatch = part.match(/^[一二三四五六七八九十]+[、．\.]([^\n]*)/);
      chapters.push({
        title: titleMatch ? titleMatch[0].trim() : `段落 ${idx + 1}`,
        text: part
      });
    });
  } else {
    chapters.push({ title: '全文', text: fullText });
  }
}

// 按段落拆分
const result = {
  title: '个体权利的捍卫',
  edition: 'PDF',
  source: '文明之光',
  chapters: chapters.map((ch, idx) => ({
    id: `ch${String(idx + 1).padStart(2, '0')}`,
    title: ch.title,
    paragraphs: splitIntoParagraphs(ch.text, `p_${idx}`)
  }))
};

fs.writeFileSync('data/wenmingzhiguang.json', JSON.stringify(result, null, 2), 'utf-8');
console.log(`✅ 输出 data/wenmingzhiguang.json`);
console.log(`  标题: ${result.title}`);
console.log(`  共 ${result.chapters.length} 章`);
result.chapters.forEach(ch => {
  const charCount = ch.paragraphs.reduce((s, p) => s + p.text.length, 0);
  console.log(`  ${ch.title}: ${ch.paragraphs.length} 段, ${charCount} 字`);
});

function splitIntoParagraphs(text, prefix) {
  // 按换行或句号分割成段落
  const raw = text.split(/\n+/).filter(s => s.trim());
  const paras = [];
  raw.forEach((para, i) => {
    // 长段落按句号分割
    if (para.length > 300) {
      const sentences = para.split(/(?<=[。！？])/);
      sentences.forEach((s, j) => {
        if (s.trim()) {
          paras.push({ id: `${prefix}_${i}_${j}`, text: s.trim() });
        }
      });
    } else {
      paras.push({ id: `${prefix}_${i}`, text: para.trim() });
    }
  });
  return paras.length > 0 ? paras : [{ id: `${prefix}_0`, text: text.trim() }];
}
