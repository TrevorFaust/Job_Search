import config from '../../config/config.js';

export function buildPriorityAlertHtml({ label, url, roleCount = 1 }) {
  const roleLine =
    roleCount === 1
      ? `There is a job listing on the ${label} careers page.`
      : `There are ${roleCount} job listings on the ${label} careers page.`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <h1 style="font-size:22px;margin:0 0 16px;">${label} careers update</h1>
    <p style="font-size:16px;line-height:1.5;color:#222;margin:0 0 20px;">${roleLine}</p>
    <p style="margin:0;">
      <a href="${url}" style="font-size:16px;font-weight:600;color:#1a56db;text-decoration:none;">${url}</a>
    </p>
  </div>`;
}

async function sendViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  const from = process.env.EMAIL_FROM || 'Job Hunter <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}

async function sendViaGmail({ to, subject, html }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');

  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  await transport.sendMail({ from: `Job Hunter <${user}>`, to, subject, html });
}

export async function sendPriorityAlert({ to: overrideTo, label, url, roleCount = 1 } = {}) {
  const to = overrideTo || process.env.EMAIL_TO;
  if (!to) throw new Error('EMAIL_TO is not set in .env');
  if (!label || !url) throw new Error('Priority alert requires label and url');

  const subject = `${config.email.subjectPrefix}: ${label} job on careers page`;
  const html = buildPriorityAlertHtml({ label, url, roleCount });

  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  if (provider === 'gmail') {
    await sendViaGmail({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}
