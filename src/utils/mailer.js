import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendPasswordResetEmail(toEmail, resetLink) {
  const msg = {
    to: toEmail,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: 'Inventora — Reset your password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
        <h1 style="font-size:20px;color:#1e293b;margin:0 0 8px;">Reset your password</h1>
        <p style="color:#475569;font-size:14px;margin:0 0 24px;">
          We received a request to reset the password for your Inventora account.
          Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
          Reset password
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  };

  await sgMail.send(msg);
}
