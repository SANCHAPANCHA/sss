import nodemailer from 'nodemailer';

export function createMailer({ smtpUrl, from, siteName, isProd }) {
  if (!smtpUrl) {
    if (isProd) {
      return async () => {
        throw new Error('SMTP_URL is not configured');
      };
    }
    console.warn('[mail] SMTP_URL is not set: login codes are printed here and shown in the browser (dev only).');
    return async ({ to, code }) => {
      console.log(`[mail] Login code for ${to}: ${code}`);
      return { devCode: code };
    };
  }

  const transport = nodemailer.createTransport(smtpUrl);
  return async ({ to, code }) => {
    await transport.sendMail({
      from,
      to,
      subject: `${code} is your ${siteName} login code`,
      text: `Your ${siteName} login code is ${code}.\n\nIt expires in 10 minutes. If you didn't request it, just ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;background:#05070a;color:#eef2f8;padding:32px;border-radius:16px;max-width:420px">
        <h2 style="margin:0 0 12px">🐉 ${siteName}</h2>
        <p style="margin:0 0 20px;color:#8d97ab">Your login code:</p>
        <p style="font-size:34px;letter-spacing:10px;font-weight:bold;margin:0 0 20px;color:#ffc65a">${code}</p>
        <p style="margin:0;color:#8d97ab;font-size:13px">It expires in 10 minutes. If you didn't request it, just ignore this email.</p>
      </div>`,
    });
    return {};
  };
}
