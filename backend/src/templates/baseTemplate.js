import { emailConfig } from '../config/email.config.js'

const BRAND = '#4a41d1'
const INK = '#14152e'
const MUTED = '#666b88'
const LINE = '#e7e8f1'
const CANVAS = '#f6f6fb'

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * Shared transactional layout: table-based and inline-styled so it renders in Gmail/Outlook/Apple
 * Mail, single column (max 560px) so it is readable on phones. Every dynamic value is HTML-escaped.
 *
 * @param {{ preheader: string, heading: string, paragraphs: string[], button?: { label: string, url: string },
 *           details?: Array<[string, string]>, footnote?: string }} content
 * @returns {{ html: string, text: string }}
 */
export function renderEmail({ preheader, heading, paragraphs, button, details = [], footnote }) {
  const support = emailConfig.supportEmail
  const supportLine = support ? `Need help? Contact ${support}.` : ''

  const paragraphsHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK};">${escapeHtml(p)}</p>`)
    .join('')

  const detailsHtml = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;background:${CANVAS};border-radius:12px;">${details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:10px 16px;font-size:13px;color:${MUTED};width:42%;">${escapeHtml(label)}</td><td style="padding:10px 16px;font-size:15px;font-weight:600;color:${INK};">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''

  const buttonHtml = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:12px;background:${BRAND};"><a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(button.label)}</a></td></tr></table>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:${MUTED};">If the button does not work, copy this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:${BRAND};word-break:break-all;">${escapeHtml(button.url)}</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td style="padding:28px 32px 0;"><span style="font-size:22px;font-weight:800;color:${INK};letter-spacing:-0.3px;">Ready<span style="color:${BRAND};">Set</span></span></td></tr>
    <tr><td style="padding:20px 32px 8px;">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${INK};">${escapeHtml(heading)}</h1>
      ${paragraphsHtml}${detailsHtml}${buttonHtml}
      ${footnote ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(footnote)}</p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 32px 28px;border-top:1px solid ${LINE};font-size:12px;line-height:1.5;color:${MUTED};">
      You are receiving this email because of activity on your ReadySet account.${supportLine ? `<br>${escapeHtml(supportLine)}` : ''}
    </td></tr>
  </table>
</td></tr></table></body></html>`

  const text = [
    `ReadySet`,
    '',
    heading,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(details.length ? [''] : []),
    ...(button ? [`${button.label}: ${button.url}`, ''] : []),
    ...(footnote ? [footnote, ''] : []),
    '--',
    'You are receiving this email because of activity on your ReadySet account.',
    ...(supportLine ? [supportLine] : []),
  ].join('\n')

  return { html, text }
}
