/**
 * gen_pinyin.js
 * 为经文所有汉字生成拼音映射 → src/data/pinyin.json
 * 
 * 使用 pinyin-pro 库，生成 { "char": "pīnyīn", ... } 映射。
 * 为提高准确性，用句子上下文推断多音字。
 */
const fs = require('fs');
const path = require('path');
const { pinyin } = require('pinyin-pro');

const ZONGBAO = path.join(__dirname, '..', 'data', 'zongbao.json');
const DUNHUANG = path.join(__dirname, '..', 'data', 'dunhuang.json');
const OUT_PATH = path.join(__dirname, '..', 'data', 'pinyin.json');

// 收集所有句子文本
function collectTexts(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const texts = [];
  data.chapters.forEach(ch => {
    ch.paragraphs.forEach(p => {
      texts.push(p.text);
    });
  });
  return texts;
}

function main() {
  console.log('收集经文文本...');
  const texts = [
    ...collectTexts(ZONGBAO),
    ...(fs.existsSync(DUNHUANG) ? collectTexts(DUNHUANG) : []),
  ];

  console.log(`共 ${texts.length} 段文本`);

  // 为每段文本生成带声调拼音（逐字对应）
  const charPinyin = {}; // char → pinyin (last wins, context-aware)

  for (const text of texts) {
    // pinyin-pro 的 pinyin() 返回空格分隔的拼音
    const py = pinyin(text, { toneType: 'symbol', type: 'array' });
    const chars = [...text]; // 正确处理 Unicode

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      // 只处理 CJK 汉字范围
      const code = ch.codePointAt(0);
      if (code >= 0x4E00 && code <= 0x9FFF ||
          code >= 0x3400 && code <= 0x4DBF ||
          code >= 0x20000 && code <= 0x2A6DF) {
        if (py[i]) {
          charPinyin[ch] = py[i];
        }
      }
    }
  }

  const count = Object.keys(charPinyin).length;
  console.log(`生成 ${count} 个汉字的拼音映射`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(charPinyin, null, 0), 'utf-8');
  console.log(`✅ 输出: ${OUT_PATH} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB)`);
}

main();
