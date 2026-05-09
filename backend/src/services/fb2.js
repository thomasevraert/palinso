const { JSDOM } = require('jsdom');
const fs   = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../../epubs');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nodeToFb2(node) {
  if (node.nodeType === 3) return esc(node.textContent);

  const tag = node.nodeName.toLowerCase();
  const inner = () => Array.from(node.childNodes).map(nodeToFb2).join('');

  switch (tag) {
    case 'p':        return `<p>${inner()}</p>\n`;
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
                     return `<subtitle>${inner()}</subtitle>\n`;
    case 'strong': case 'b':  return `<strong>${inner()}</strong>`;
    case 'em': case 'i':      return `<emphasis>${inner()}</emphasis>`;
    case 'br':       return '<empty-line/>';
    case 'li':       return `<p>• ${inner()}</p>\n`;
    case 'blockquote': return `<cite>${inner()}</cite>\n`;
    case 'img':      return '';
    case 'a':        return inner();
    default:         return inner();
  }
}

async function generateFb2(article, articleId) {
  const outputPath = path.join(OUTPUT_DIR, `${articleId}.fb2`);
  const dom     = new JSDOM(article.content || '');
  const body    = dom.window.document.body;
  const content = Array.from(body.childNodes).map(nodeToFb2).join('');
  const title   = esc(article.title  || 'Article');
  const author  = esc(article.author || 'Palinso');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>nonfiction</genre>
      <author><nickname>${author}</nickname></author>
      <book-title>${title}</book-title>
      <lang>fr</lang>
    </title-info>
    <document-info>
      <author><nickname>Palinso</nickname></author>
      <program-used>Palinso</program-used>
    </document-info>
  </description>
  <body>
    <section>
      <title><p>${title}</p></title>
      ${content}
    </section>
  </body>
</FictionBook>`;

  fs.writeFileSync(outputPath, xml, 'utf8');
  return outputPath;
}

module.exports = { generateFb2 };
