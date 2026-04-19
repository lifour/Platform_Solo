/**
 * gen_pinyin_html.js
 * 为每段经文生成带 <ruby> 注音的 HTML，输出 zongbao_pinyin.json/dunhuang_pinyin.json
 */
const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');

const ZONGBAO = path.join(__dirname, '..', 'src', 'data', 'zongbao.json');
const DUNHUANG = path.join(__dirname, '..', 'src', 'data', 'dunhuang.json');
const OUT_ZB = path.join(__dirname, '..', 'src', 'data', 'zongbao_pinyin.json');
const OUT_DH = path.join(__dirname, '..', 'src', 'data', 'dunhuang_pinyin.json');

function rubyHtml(text) {
  const pyArr = pinyin(text, { toneType: 'symbol', type: 'array' });
  let html = '';
  let idx = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF)) {
      html += `<ruby>${ch}<rt>${pyArr[idx] || ''}</rt></ruby>`;
    } else {
      html += ch;
    }
    idx++;
  }
  return html;
}

function processFile(inPath, outPath) {
  const data = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  data.chapters.forEach(ch => {
    ch.paragraphs.forEach(p => {
      p.pinyinHtml = rubyHtml(p.text);
    });
    if (ch.title) ch.pinyinTitle = rubyHtml(ch.title);
  });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 0), 'utf-8');
  console.log(`✅ 输出: ${outPath}`);
}

processFile(ZONGBAO, OUT_ZB);
if (fs.existsSync(DUNHUANG)) processFile(DUNHUANG, OUT_DH);
