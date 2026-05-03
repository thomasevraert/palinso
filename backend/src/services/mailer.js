const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

async function sendToKindle(epubPath, kindleEmail, articleTitle) {
  // Crée la connexion avec le serveur email
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: kindleEmail,
    // Le mot "Convert:" au début du sujet demande à Amazon de convertir le fichier
    subject: `Convert: ${articleTitle}`,
    text: 'Envoyé depuis KTool Clone.',
    attachments: [
      {
        filename: path.basename(epubPath),
        content: fs.readFileSync(epubPath),
        contentType: 'application/epub+zip',
      },
    ],
  });
}

module.exports = { sendToKindle };