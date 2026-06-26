import config from '../../config/config.js';
import { formatAnnualSalary } from '../../lib/salary.js';

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function salaryLine(job) {
  const annual = formatAnnualSalary(job.salary_min_annual, job.salary_max_annual);
  if (annual) return annual;
  return job.salary || job.salary_raw || null;
}

export function buildDigestHtml(jobs) {
  const byProfile = {};
  for (const job of jobs) {
    const key = job.profile_name ?? 'Matches';
    (byProfile[key] ??= []).push(job);
  }

  const sections = Object.entries(byProfile)
    .map(([profileName, profileJobs]) => {
      const items = profileJobs
        .map((j) => {
          const sal = salaryLine(j);
          return `
        <div style="margin:0 0 16px 0;padding:12px 16px;border:1px solid #e2e2e2;border-radius:8px;">
          <a href="${j.url}" style="font-size:16px;font-weight:600;color:#1a56db;text-decoration:none;">${escapeHtml(j.title)}</a>
          <div style="color:#444;font-size:14px;margin-top:4px;">
            ${escapeHtml(j.company ?? 'Unknown company')}${j.location ? ` &middot; ${escapeHtml(j.location)}` : ''}${sal ? ` &middot; ${escapeHtml(sal)}` : ''}
          </div>
          ${j.matched_keywords?.length ? `<div style="font-size:12px;color:#888;margin-top:4px;">matched: ${escapeHtml(j.matched_keywords.join(', '))}</div>` : ''}
          ${j.description ? `<div style="font-size:13px;color:#555;margin-top:6px;">${escapeHtml(String(j.description).slice(0, 220))}…</div>` : ''}
        </div>`;
        })
        .join('');
      return `<h2 style="font-size:18px;margin:24px 0 12px;">${escapeHtml(profileName)} (${profileJobs.length})</h2>${items}`;
    })
    .join('');

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <h1 style="font-size:22px;">${jobs.length} new job${jobs.length === 1 ? '' : 's'} matching your filters</h1>
    ${sections}
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

export async function sendDigest(jobs, { to: overrideTo } = {}) {
  const to = overrideTo || process.env.EMAIL_TO;
  if (!to) throw new Error('EMAIL_TO is not set in .env');

  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const subject = `${config.email.subjectPrefix}: ${jobs.length} new match${jobs.length === 1 ? '' : 'es'} (${today})`;
  const html = buildDigestHtml(jobs);

  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  if (provider === 'gmail') {
    await sendViaGmail({ to, subject, html });
  } else {
    await sendViaResend({ to, subject, html });
  }
}
