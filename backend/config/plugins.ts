import type { Core } from '@strapi/strapi';

const allowedMediaTypes = [
  'image/*',
  'video/*',
  'audio/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*',
  'text/plain',
  'text/csv',
];

const deniedExecutableTypes = [
  'application/vnd.microsoft.portable-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/x-dosexec',
  'application/x-sh',
  'text/x-shellscript',
  'application/x-mach-binary',
];

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'users-permissions': {
    config: {
      jwtManagement: 'legacy-support',
    },
  },
  // Outgoing mail. When SMTP_HOST is set the nodemailer provider is used with
  // the SMTP_* / EMAIL_FROM environment variables (dev: an Ethereal test
  // inbox; prod: a real transactional provider). Otherwise it falls back to the
  // bundled sendmail provider. Delivery failures never break requests — they
  // are logged and the app fails over gracefully.
  email: {
    config: {
      provider: env('SMTP_HOST') ? 'nodemailer' : 'sendmail',
      providerOptions: env('SMTP_HOST')
        ? {
            host: env('SMTP_HOST'),
            port: env.int('SMTP_PORT', 587),
            secure: env.bool('SMTP_SECURE', false),
            auth: env('SMTP_USER')
              ? {
                  user: env('SMTP_USER'),
                  pass: env('SMTP_PASSWORD'),
                }
              : undefined,
          }
        : {},
      settings: {
        defaultFrom: env('EMAIL_FROM', 'iMapSU <no-reply@imapsu.local>'),
        defaultReplyTo: env('EMAIL_REPLY_TO', 'iMapSU <no-reply@imapsu.local>'),
      },
    },
  },
  upload: {
    config: {
      security: {
        allowedTypes: allowedMediaTypes,
        deniedTypes: deniedExecutableTypes,
      },
    },
  },
});

export default config;
