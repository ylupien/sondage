// Envoi des invitations par SMTP (nodemailer).
//   RESEND_API_KEY seul : SMTP de Resend (même configuration que le projet disponibilités)
//   SMTP_HOST (+ SMTP_*) : n'importe quel serveur SMTP, prioritaire sur Resend
// Sans l'un ni l'autre, le lien est seulement journalisé.
import nodemailer from 'nodemailer';
import { invitationEmail, LOGO_CID, LOGO_PNG } from './emailTemplate.js';

const HOST = process.env.SMTP_HOST || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.MAIL_FROM || process.env.SMTP_USER || 'pool@localhost';

const transport = HOST
  ? nodemailer.createTransport({
      host: HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true', // true pour le port 465
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    })
  : RESEND_KEY
    ? nodemailer.createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: RESEND_KEY } })
    : null;

export const mailProvider = () => (HOST ? `SMTP ${HOST}` : RESEND_KEY ? 'Resend' : null);
export const verifyMail = () => (transport ? transport.verify() : Promise.reject(new Error('non configuré')));

export const mailConfigured = () => Boolean(transport);

// Invitation : gabarit HTML + texte (emailTemplate.js), logo intégré en pièce jointe interne (cid)
export async function sendInvitation({ name, email, url, title, description, phrases }) {
  if (!transport) {
    console.log(`[courriel non configuré] ${name} <${email}> : ${url}`);
    return { ok: false, error: 'courriel non configuré : lien à transmettre à la main' };
  }
  const { subject, html, text } = invitationEmail({ name, url, title, description, phrases });
  try {
    await transport.sendMail({
      from: FROM,
      to: name ? { name, address: email } : email,
      subject,
      text,
      html,
      attachments: [{ filename: 'logo.png', content: LOGO_PNG, contentType: 'image/png', cid: LOGO_CID, contentDisposition: 'inline' }],
    });
    return { ok: true };
  } catch (err) {
    console.error(`[courriel] échec pour ${email} :`, err.message);
    return { ok: false, error: err.message };
  }
}
