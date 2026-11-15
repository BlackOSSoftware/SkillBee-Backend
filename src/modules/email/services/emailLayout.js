import { env } from '../../../config/env.js';

/**
 * Shared branded email layout for all SkillBee transactional emails.
 *
 * Email-client safe by design:
 * - Table-based layout, inline CSS for everything critical.
 * - One embedded <style> block only for mobile media queries (progressive enhancement).
 * - System font stacks, no external assets, no JavaScript.
 * - Brand palette mirrors the admin theme (--primary #1592ca, --accent #5b7cf0).
 *
 * All content strings may contain {{variable}} placeholders — they are
 * substituted (and HTML-escaped) later by renderTemplate().
 */

const BRAND = Object.freeze({
  primary: '#1592ca',
  primaryDark: '#0f7ea8',
  accent: '#5b7cf0',
  ink: '#2d3142',
  muted: '#6b7083',
  subtle: '#9ba0b0',
  border: '#e6e9f0',
  bg: '#f4f6fa',
  card: '#ffffff',
  soft: '#eef6fb',
});

function siteUrl() {
  return (env.PUBLIC_SITE_URL || env.FRONTEND_BASE_URL || 'https://skillbee.com').replace(/\/$/, '');
}

/** Absolute URL on the public site for use in template CTAs. */
export function sitePath(path = '') {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Hidden inbox preview text. */
function preheader(text) {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(text)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>`;
}

/** Brand wordmark — text-based so it renders with images blocked. */
function logo() {
  return (
    `<span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${BRAND.ink};">` +
    `Skill<span style="color:${BRAND.primary};">Bee</span></span>`
  );
}

/** Eyebrow label above the heading (e.g. "PAYMENT CONFIRMATION"). */
function eyebrow(text) {
  if (!text) return '';
  return `<p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.primary};">${esc(text)}</p>`;
}

/** Primary CTA button (bulletproof table-based). */
export function ctaButton({ label, url, align = 'left' }) {
  const safeUrl = String(url || siteUrl()).replace(/"/g, '%22');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;${align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}">` +
    `<tr><td align="center" style="border-radius:8px;background:${BRAND.primary};">` +
    `<a href="${safeUrl}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;mso-padding-alt:0;">${esc(label)}</a>` +
    `</td></tr></table>`
  );
}

/** Key/value detail rows rendered as a clean table. Values may contain placeholders. */
export function detailTable(rows) {
  const body = rows
    .filter((r) => r && r.label && r.value !== undefined && r.value !== null && r.value !== '')
    .map(
      (r, i) =>
        `<tr>` +
        `<td style="padding:11px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.muted};width:38%;border-top:${i === 0 ? 'none' : `1px solid ${BRAND.border}`};">${esc(r.label)}</td>` +
        `<td style="padding:11px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:${BRAND.ink};border-top:${i === 0 ? 'none' : `1px solid ${BRAND.border}`};">${r.value}</td>` +
        `</tr>`
    )
    .join('');
  if (!body) return '';
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">` +
    `<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table></td></tr></table>`
  );
}

/** Small helper for a paragraph of body copy (placeholders allowed). */
export function p(html) {
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${BRAND.ink};">${html}</p>`;
}

/** Muted helper paragraph. */
export function muted(html) {
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.muted};">${html}</p>`;
}

/**
 * Full branded document.
 * @param {object} opts
 * @param {string} opts.preheader   Inbox preview text.
 * @param {string} [opts.eyebrow]   Small uppercase label.
 * @param {string} opts.heading     Main heading (may contain placeholders).
 * @param {string} opts.bodyHtml    Inner content HTML (use p/detailTable/ctaButton helpers).
 * @param {string} [opts.footerNote] Optional extra footer line.
 */
export function brandedEmail({ preheader: preview, eyebrow: label, heading, bodyHtml, footerNote }) {
  const year = new Date().getFullYear();
  const url = siteUrl();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>SkillBee</title>
<style>
  @media only screen and (max-width:620px){
    .sb-container{width:100%!important;}
    .sb-pad{padding-left:22px!important;padding-right:22px!important;}
    .sb-heading{font-size:22px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;">
${preheader(preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="sb-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <!-- Brand header -->
    <tr><td style="padding:0 0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left">${logo()}</td>
          <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};">Learning, simplified</td>
        </tr>
      </table>
    </td></tr>

    <!-- Accent rule -->
    <tr><td style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,${BRAND.primary},${BRAND.accent});border-radius:3px;">&nbsp;</td></tr>

    <!-- Content card -->
    <tr><td style="background:${BRAND.card};border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="sb-pad" style="padding:34px 40px 30px;">
          ${eyebrow(label)}
          <h1 class="sb-heading" style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.3;font-weight:800;color:${BRAND.ink};">${esc(heading)}</h1>
          ${bodyHtml}
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-top:none;border-radius:0 0 12px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="sb-pad" style="padding:24px 40px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding-bottom:14px;border-bottom:1px solid ${BRAND.border};">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${BRAND.ink};">${logo()}</span>
            </td></tr>
            <tr><td style="padding-top:14px;">
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
                You received this email because you have an account or activity on SkillBee.
                ${footerNote ? `<br>${esc(footerNote)}` : ''}
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.subtle};">
                <a href="${url}" style="color:${BRAND.primary};text-decoration:none;">${esc(url.replace(/^https?:\/\//, ''))}</a>
                &nbsp;·&nbsp; &copy; ${year} SkillBee. All rights reserved.
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}
