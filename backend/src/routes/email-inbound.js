const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { generateEpub } = require('../services/epub');
const { sendToKindle } = require('../services/mailer');
const { get, run } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function verifyMailgunSignature(signingKey, timestamp, token, signature) {
  const hash = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');
  return hash === signature;
}

router.post('/', upload.any(), async (req, res) => {
  const { timestamp, token, signature } = req.body;
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;

  if (!signingKey || !verifyMailgunSignature(signingKey, timestamp, token, signature)) {
    return res.status(200).json({ received: false });
  }

  res.json({ received: true });

  setImmediate(async () => {
    try {
      const emailToken = (req.body.recipient || '').split('@')[0];
      if (!emailToken) return;

      const user = await get(
        'SELECT id, kindle_email, plan FROM users WHERE email_token = $1',
        [emailToken]
      );
      if (!user) return;
      if (user.plan !== 'pro') return;
      if (!user.kindle_email) return;

      const rawHtml = req.body['body-html'] || req.body['body-plain'];
      if (!rawHtml) return;

      const dom = new JSDOM(rawHtml, { url: 'https://newsletter.invalid' });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const content = article ? article.content : rawHtml;

      const title = req.body.subject || 'Newsletter';
      const author = req.body.from || 'Newsletter';

      const articleId = crypto.randomUUID();
      const epubPath = await generateEpub(
        { title, author, siteName: author, content },
        articleId
      );

      await sendToKindle(epubPath, user.kindle_email, title);

      const url = 'newsletter:' + (req.body.from || 'unknown');
      await run(
        `INSERT INTO articles
          (id, user_id, url, title, author, content_html, epub_path, status, kindle_sent, format)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'done', 1, 'epub3')`,
        [articleId, user.id, url, title, author, content, epubPath]
      );
    } catch (err) {
      console.error('[email-inbound] processing error:', err);
    }
  });
});

module.exports = router;
