/**
 * email helper
 *
 * Email delivery through the Strapi email plugin is best-effort: a failing or
 * missing provider never breaks a request, it is logged instead. The
 * verification link is still surfaced so callers (and the logs) can fall back
 * when no real SMTP provider is configured yet.
 */

import type { Core } from '@strapi/strapi';

type Strapi = Core.Strapi;

function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000';
}

export function verificationLink(token: string): string {
  return `${frontendUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(
  strapi: Strapi,
  input: { to: string; username?: string; token: string }
): Promise<boolean> {
  const link = verificationLink(input.token);
  const text = [
    `Welcome to iMapSU${input.username ? `, ${input.username}` : ''}!`,
    '',
    'Verify your email address to activate your account:',
    link,
    '',
    'The link is valid for your account only. If you did not create this account, you can safely ignore this email.',
  ].join('\n');

  const html = `
<p>Welcome to iMapSU${input.username ? `, <strong>${escapeHtml(input.username)}</strong>` : ''}!</p>
<p>Verify your email address to activate your account:</p>
<p><a href="${link}">Verify my email &amp; activate my account</a></p>
<p style="color:#777;font-size:12px">The link is valid for your account only. If you did not create this account, you can safely ignore this email.</p>
`.trim();

  return trySendEmail(strapi, {
    to: input.to,
    subject: 'Verify your iMapSU account',
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