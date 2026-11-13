// Gabarit du courriel d'invitation : HTML compatible clients courriel (tableaux, styles en ligne, largeur 600 px)
// + version texte. Le logo est une image intégrée au message (cid:logo), jamais téléchargée depuis le web.
import { readFileSync } from 'node:fs';

export const LOGO_CID = 'logo@sondage';
export const LOGO_PNG = readFileSync(new URL('./assets/logo-email.png', import.meta.url));

const BRAND = '#6741D9';
const INK = '#1A1530';
const MUTED = '#6B6880';
const LINE = '#ECEAF4';
const BG = '#F5F4FA';
const PREVIEW_MAX = 6; // phrases montrées dans l'aperçu
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/**
 * @param {object} p
 * @param {string} p.name         prénom ou nom de la personne (facultatif)
 * @param {string} p.url          lien personnel
 * @param {string} p.title        question du sondage
 * @param {string} [p.description]
 * @param {{text: string}[]} p.phrases
 * @param {string} [p.logoSrc]    source du logo (cid par défaut ; data: pour l'aperçu dans l'admin)
 */
export function invitationEmail({ name, url, title, description = '', phrases = [], logoSrc = `cid:${LOGO_CID}` }) {
  const hello = name ? `Bonjour ${name},` : 'Bonjour,';
  const shown = phrases.slice(0, PREVIEW_MAX);
  const more = phrases.length - shown.length;
  const subject = `Votre avis compte : ${title}`;
  const minutes = Math.max(1, Math.ceil((phrases.length * 10) / 60)); // ~10 s par phrase
  const duration = `environ ${plural(minutes, 'minute', 'minutes')}`;
  const preheader = `${plural(phrases.length, 'phrase', 'phrases')} à évaluer, ${duration}. Cliquez sur « Participer ».`;

  const rows = shown
    .map(
      (p, i) => `
              <tr>
                <td width="28" valign="top" style="padding:10px 0;border-top:${i ? `1px solid ${LINE}` : '0'};font:600 13px/20px ${FONT};color:${BRAND};">${i + 1}.</td>
                <td valign="top" style="padding:10px 0;border-top:${i ? `1px solid ${LINE}` : '0'};font:15px/22px ${FONT};color:${INK};">${esc(p.text)}</td>
              </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>${esc(subject)}</title>
<!--[if mso]><style>td,a,span,p{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
  @media (max-width:620px){ .container{width:100%!important} .px{padding-left:24px!important;padding-right:24px!important} .btn a{display:block!important} }
</style>
</head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <!-- Logo -->
        <tr>
          <td align="center" style="padding:0 0 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle"><img src="${esc(logoSrc)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:11px;"></td>
              <td valign="middle" style="padding-left:10px;font:700 20px/24px ${FONT};color:${INK};letter-spacing:-0.2px;">Sondage</td>
            </tr></table>
          </td>
        </tr>

        <!-- Carte -->
        <tr>
          <td style="background:#FFFFFF;border-radius:16px;border:1px solid ${LINE};overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td height="6" style="background:${BRAND};font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr>
                <td class="px" style="padding:36px 40px 8px;">
                  <p style="margin:0 0 6px;font:600 12px/16px ${FONT};color:${BRAND};text-transform:uppercase;letter-spacing:1px;">Invitation à participer</p>
                  <h1 style="margin:0 0 20px;font:700 24px/31px ${FONT};color:${INK};">${esc(title)}</h1>
                  <p style="margin:0 0 12px;font:16px/24px ${FONT};color:${INK};">${esc(hello)}</p>
                  <p style="margin:0 0 ${description ? 12 : 24}px;font:16px/24px ${FONT};color:${INK};">
                    Votre avis est demandé : donnez un <strong>J'aime</strong> ou un <strong>J'aime pas</strong> à chaque phrase,
                    puis classez-les selon vos priorités. Tout s'enregistre automatiquement, sans bouton à cliquer.
                  </p>
                  ${description ? `<p style="margin:0 0 24px;padding:12px 16px;background:${BG};border-radius:10px;font:15px/22px ${FONT};color:${MUTED};">${esc(description).replace(/\n/g, '<br>')}</p>` : ''}
                </td>
              </tr>

              <!-- Aperçu des phrases -->
              <tr>
                <td class="px" style="padding:0 40px;">
                  <p style="margin:0 0 4px;font:600 13px/18px ${FONT};color:${MUTED};">Aperçu · ${plural(phrases.length, 'phrase', 'phrases')}</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
                  </table>
                  ${more > 0 ? `<p style="margin:4px 0 0;font:14px/20px ${FONT};color:${MUTED};">… et ${plural(more, 'autre phrase', 'autres phrases')}.</p>` : ''}
                </td>
              </tr>

              <!-- Bouton -->
              <tr>
                <td align="center" class="px" style="padding:32px 40px 12px;">
                  <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td align="center" bgcolor="${BRAND}" style="border-radius:10px;">
                      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(url)}" style="height:50px;v-text-anchor:middle;width:240px;" arcsize="20%" fillcolor="${BRAND}" stroke="f"><center style="color:#FFFFFF;font:bold 17px Arial,sans-serif;">Participer</center></v:roundrect><![endif]-->
                      <!--[if !mso]><!-->
                      <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 56px;font:700 17px/20px ${FONT};color:#FFFFFF;text-decoration:none;border-radius:10px;">Participer</a>
                      <!--<![endif]-->
                    </td>
                  </tr></table>
                </td>
              </tr>
              <tr>
                <td align="center" class="px" style="padding:0 40px 36px;font:13px/19px ${FONT};color:${MUTED};">
                  ${duration[0].toUpperCase() + duration.slice(1)} · vous pouvez revenir modifier vos choix à tout moment.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Pied -->
        <tr>
          <td class="px" style="padding:24px 40px 0;font:12px/18px ${FONT};color:${MUTED};text-align:center;">
            Ce lien est personnel : il vous identifie, merci de ne pas le transférer.<br>
            Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>
            <a href="${esc(url)}" style="color:${BRAND};word-break:break-all;">${esc(url)}</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    hello,
    '',
    `Votre avis est demandé : « ${title} »`,
    description ? `\n${description}` : null,
    '',
    "Donnez un J'aime ou un J'aime pas à chaque phrase, puis classez-les selon vos priorités. Tout s'enregistre automatiquement.",
    '',
    `Aperçu (${plural(phrases.length, 'phrase', 'phrases')}) :`,
    ...shown.map((p, i) => `  ${i + 1}. ${p.text}`),
    more > 0 ? `  … et ${plural(more, 'autre phrase', 'autres phrases')}.` : null,
    '',
    `Participer : ${url}`,
    '',
    'Ce lien est personnel : merci de ne pas le transférer.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { subject, html, text };
}
