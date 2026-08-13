/**
 * 从校订版 Markdown 卷首提取宗宝本《序》《赞》，加入阅读数据。
 * 用法：node scripts/add_zongbao_prefaces.js <简体本.md> <繁体本.md>
 */
const fs = require('fs');
const path = require('path');

const simplifiedPath = process.argv[2];
const traditionalPath = process.argv[3];
if (!simplifiedPath || !traditionalPath) {
  throw new Error('请传入简体本和繁体本 Markdown 路径');
}

function cleanBlock(block) {
  return block
    .replace(/<small>(.*?)<\/small>/gs, '$1')
    .replace(/\s*\n\s*/g, '')
    .trim();
}

function extractSection(markdown, heading, nextHeading) {
  const startMarker = `# ${heading}`;
  const endMarker = `# ${nextHeading}`;
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`未找到卷首章节：${heading}`);
  return markdown
    .slice(start + startMarker.length, end)
    .trim()
    .split(/\n\s*\n/)
    .map(cleanBlock)
    .filter(Boolean);
}

const simplified = fs.readFileSync(simplifiedPath, 'utf8');
const traditional = fs.readFileSync(traditionalPath, 'utf8');
const definitions = [
  { id: 'preface-sequence', simple: '六祖大师法宝坛经序', traditional: '六祖大師法寶壇經序', nextSimple: '六祖大师法宝坛经赞', nextTraditional: '六祖大師法寶壇經贊' },
  { id: 'preface-praise', simple: '六祖大师法宝坛经赞', traditional: '六祖大師法寶壇經贊', nextSimple: '六祖大师法宝坛经', nextTraditional: '六祖大師法寶壇經' }
];

const chapters = definitions.map(definition => {
  const simpleBlocks = extractSection(simplified, definition.simple, definition.nextSimple);
  const traditionalBlocks = extractSection(traditional, definition.traditional, definition.nextTraditional);
  if (simpleBlocks.length !== traditionalBlocks.length) {
    throw new Error(`${definition.simple} 的繁简段落数不一致：${simpleBlocks.length}/${traditionalBlocks.length}`);
  }
  return {
    id: definition.id,
    title: definition.simple,
    traditionalTitle: definition.traditional,
    kind: 'preface',
    paragraphs: simpleBlocks.map((text, index) => ({
      id: `${definition.id}-p${String(index + 1).padStart(2, '0')}`,
      text,
      traditionalText: traditionalBlocks[index]
    }))
  };
});

const outputPath = path.join(__dirname, '..', 'data', 'zongbao.json');
const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
data.chapters = [
  ...chapters,
  ...data.chapters.filter(chapter => !definitions.some(definition => definition.id === chapter.id))
];
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + '\n');
console.log(`已加入卷首：${chapters.map(chapter => `${chapter.title}（${chapter.paragraphs.length}段）`).join('、')}`);
