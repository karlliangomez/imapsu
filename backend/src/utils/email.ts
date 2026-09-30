/**
 * email helper
 *
 * Email delivery through the Strapi email plugin is best-effort: a failing or
 * missing provider never breaks a request, it is logged instead. Account
 * verification uses a short-lived 6-digit code (OTP) sent by email, not a
 * clickable link.
 */

import { randomInt } from 'node:crypto';
import type { Core } from '@strapi/strapi';

type Strapi = Core.Strapi;

const OTP_TTL_MS = 10 * 60 * 1000;

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

export function otpPageUrl(): string {
  return `${frontendUrl()}/verify-email`;
}

/**
 * Generates a 6-digit code and the opaque value stored on the user row. The
 * stored value embeds the expiry timestamp (`<code>.<ts>`) so confirmation can
 * be validated without an extra database column.
 */
export function generateOtp(): { code: string; value: string; expiresAt: number } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = Date.now() + OTP_TTL_MS;
  return { code, value: `${code}.${expiresAt}`, expiresAt };
}

export function otpFromValue(value: string): { code: string; expiresAt: number } | null {
  const idx = value.lastIndexOf('.');
  if (idx === -1) return null;
  const code = value.slice(0, idx);
  const expiresAt = Number(value.slice(idx + 1));
  if (!/^\d{6}$/.test(code) || !Number.isFinite(expiresAt)) return null;
  return { code, expiresAt };
}

export async function sendVerificationEmail(
  strapi: Strapi,
  input: { to: string; username?: string; code: string }
): Promise<boolean> {
  const text = [
    `Welcome to iMapSU${input.username ? `, ${input.username}` : ''}!`,
    '',
    'Your verification code is:',
    input.code,
    '',
    `Enter this code at ${otpPageUrl()} (or in the app) to activate your account. It expires in 10 minutes.`,
    'If you did not create this account, you can safely ignore this email.',
  ].join('\n');

  const html = `
<p>Welcome to iMapSU${input.username ? `, <strong>${escapeHtml(input.username)}</strong>` : ''}!</p>
<p>Your verification code is:</p>
<p style="font-size:24px;letter-spacing:6px;font-weight:700">${input.code}</p>
<p>Enter this code at <a href="${otpPageUrl()}">${otpPageUrl()}</a> (or in the app) to activate your account. It expires in 10 minutes.</p>
<p style="color:#777;font-size:12px">If you did not create this account, you can safely ignore this email.</p>
`.trim();

  return trySendEmail(strapi, {
    to: input.to,
    subject: 'Your iMapSU verification code',
    text,
    html,
  });
}

export async function trySendEmail(
  strapi: Strapi,
  input: { to: string; subject: string; text?: string; html?: string }
): Promise<boolean> {
  strapi.log.info(`[email] Sending "${input.subject}" to ${input.to}`);
  try {
    const emailService = strapi.plugin('email')?.service?.('email') as
      | { send?: (options: Record<string, unknown>) => Promise<unknown> }
      | undefined;
    if (!emailService?.send) {
      strapi.log.warn('[email] Email plugin is not available; outgoing mail skipped.');
      return false;
    }
    await emailService.send({
      to: input.to,
      subject: input.subject,
      text: input.text ?? '',
      html: input.html ?? '',
    });
    return true;
  } catch (err) {
    strapi.log.warn(`[email] Could not deliver mail to ${input.to}: ${(err as Error)?.message ?? err}`);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}