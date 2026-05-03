const Epub = require('epub-gen');
const path = require('path');
const fs = require('fs');

// Dossier où les EPUBs générés seront stockés
const OUTPUT_DIR = path.join(__dirname, '../../epubs');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateEpub(article, articleId) {
  const outputPath = path.join(OUTPUT_DIR, `${articleId}.epub`);

  const options = {
    title: article.title,
    author: article.author,
    publisher: article.siteName || 'KTool Clone',
    content: [
      {
        title: article.title,
        data: article.content,
      },
    ],
    output: outputPath,
    css: `
  body {
    font-family: Georgia, serif;
    font-size: 1em;
    line-height: 1.8;
    margin: 0 5%;
    color: #1a1a1a;
  }

  h1 {
    font-size: 1.6em;
    line-height: 1.3;
    margin-bottom: 0.5em;
    page-break-after: avoid;
  }

  h2 {
    font-size: 1.3em;
    line-height: 1.3;
    margin-top: 1.5em;
    margin-bottom: 0.4em;
    page-break-after: avoid;
  }

  h3 {
    font-size: 1.1em;
    margin-top: 1.2em;
    page-break-after: avoid;
  }

  p {
    margin: 0;
    margin-bottom: 1em;
    text-align: justify;
    orphans: 2;
    widows: 2;
  }

  p + p {
    text-indent: 1.2em;
    margin-bottom: 0;
  }

  strong {
    font-weight: bold;
  }

  em {
    font-style: italic;
  }

  blockquote {
    margin: 1.5em 2em;
    font-style: italic;
    border-left: 3px solid #ccc;
    padding-left: 1em;
  }

  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1.5em auto;
  }

  pre, code {
    font-family: monospace;
    font-size: 0.85em;
    background: #f4f4f4;
    padding: 2px 4px;
  }
`,
  };

  await new Epub(options).promise;
  return outputPath;
}

module.exports = { generateEpub };