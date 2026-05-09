const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '../../epubs');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function generateFb2(article, articleId) {
  const tempHtmlPath = path.join(OUTPUT_DIR, `${articleId}_tmp.html`);
  const outputPath = path.join(OUTPUT_DIR, `${articleId}.fb2`);

  fs.writeFileSync(tempHtmlPath, article.content, 'utf8');

  try {
    await new Promise((resolve, reject) => {
      execFile(
        'pandoc',
        [
          tempHtmlPath,
          '-o', outputPath,
          '--metadata', `title=${article.title || 'Article'}`,
          '--metadata', `creator=${article.author || article.siteName || 'Palinso'}`,
        ],
        (err) => {
          if (err) {
            return reject(new Error(
              `pandoc introuvable ou erreur de conversion.\n` +
              `Installe-le avec : brew install pandoc\n` +
              `Détail : ${err.message}`
            ));
          }
          resolve();
        }
      );
    });
  } finally {
    if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
  }

  return outputPath;
}

module.exports = { generateFb2 };
