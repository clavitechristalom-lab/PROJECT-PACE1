import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse .env file
function loadEnv() {
    const envPath = path.resolve(__dirname, '.env');
    const envVars = {};
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let val = trimmed.slice(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    envVars[key] = val;
                }
            }
        });
    }
    return envVars;
}

const envVars = loadEnv();

// Parse arguments
const args = process.argv.slice(2);
let toEmail = '';
let otpCode = '';
let recipientName = 'Valued Customer';
let cliUser = '';
let cliPass = '';
let otpType = 'login'; // 'login' | 'reset'

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--to=')) {
        toEmail = arg.slice(5).trim();
    } else if (arg.startsWith('--otp=')) {
        otpCode = arg.slice(6).trim();
    } else if (arg.startsWith('--name=')) {
        recipientName = arg.slice(7).trim();
    } else if (arg.startsWith('--user=')) {
        cliUser = arg.slice(7).trim();
    } else if (arg.startsWith('--pass=')) {
        cliPass = arg.slice(7).trim();
    } else if (arg.startsWith('--type=')) {
        otpType = arg.slice(7).trim().toLowerCase();
    }
}

const rawUser = cliUser || process.env.GMAIL_USER || envVars.GMAIL_USER || process.env.MAIL_USERNAME || envVars.MAIL_USERNAME || '';
const rawPass = cliPass || process.env.GMAIL_APP_PASSWORD || envVars.GMAIL_APP_PASSWORD || process.env.MAIL_PASSWORD || envVars.MAIL_PASSWORD || '';

const gmailUser = (rawUser && rawUser !== 'null') ? rawUser.trim() : '';
let gmailPassword = (rawPass && rawPass !== 'null') ? rawPass.trim() : '';
if ((gmailPassword.startsWith('"') && gmailPassword.endsWith('"')) || (gmailPassword.startsWith("'") && gmailPassword.endsWith("'"))) {
    gmailPassword = gmailPassword.slice(1, -1).trim();
}

if (!toEmail || !otpCode) {
    console.error(JSON.stringify({
        success: false,
        error: 'Missing required arguments: --to and --otp are required.'
    }));
    process.exit(1);
}

if (!gmailUser || !gmailPassword || gmailUser.includes('example.com') || gmailPassword === 'your_16_character_gmail_app_password') {
    console.error(JSON.stringify({
        success: false,
        error: 'Gmail credentials not configured. Please set MAIL_USERNAME / GMAIL_USER and MAIL_PASSWORD / GMAIL_APP_PASSWORD in backend/.env.'
    }));
    process.exit(1);
}

const isLogin = otpType === 'login';
const emailTitle = isLogin ? 'Login Verification Code' : 'Password Reset OTP';
const emailSubtitle = isLogin ? 'Two-Factor Authentication (2FA)' : 'Secure Account Recovery';
const emailIntro = isLogin 
    ? 'We received a sign-in attempt for your account. Use the 6-digit verification code below to verify your identity and complete your login:'
    : 'We received a request to reset the password for your account. Use the 6-digit verification code below to complete your password reset:';
const emailSecurityNotice = isLogin
    ? '• <strong>Security Notice:</strong> Never share this OTP code with anyone. PROJECT: PACE Z-LICZ staff will never ask for your code.<br>• If you did not attempt to sign in to your account, please change your password immediately.'
    : '• <strong>Security Notice:</strong> Never share this OTP code with anyone. PROJECT: PACE Z-LICZ staff will never ask for your code.<br>• If you did not request this password reset, please ignore this email. Your password will remain unchanged.';

const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0b131e; color: #f8fafc; margin: 0; padding: 30px 15px; }
    .container { max-width: 500px; margin: 0 auto; background: #121c29; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); padding: 25px 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .logo { font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #60a5fa; background: rgba(59,130,246,0.15); display: inline-block; padding: 4px 12px; border-radius: 6px; border: 1px solid rgba(59,130,246,0.3); }
    .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 15px; margin-bottom: 5px; }
    .subtitle { font-size: 13px; color: #94a3b8; }
    .body { padding: 30px 25px; text-align: center; }
    .greeting { font-size: 14px; color: #cbd5e1; margin-bottom: 20px; text-align: left; }
    .otp-box { background: rgba(15,23,42,0.9); border: 2px dashed #2563eb; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center; }
    .otp-code { font-family: "Courier New", Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; margin: 0; }
    .expiry { font-size: 12px; color: #f59e0b; margin-top: 10px; font-weight: 600; }
    .notice { font-size: 12px; color: #64748b; line-height: 1.5; text-align: left; margin-top: 25px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); }
    .footer { background: #0b131e; padding: 15px 20px; text-align: center; font-size: 11px; color: #475569; border-top: 1px solid rgba(255,255,255,0.05); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">PROJECT: PACE Z-LICZ</div>
      <div class="title">${emailTitle}</div>
      <div class="subtitle">${emailSubtitle}</div>
    </div>
    <div class="body">
      <div class="greeting">Hello <strong>${recipientName}</strong>,</div>
      <p style="font-size: 13px; color: #94a3b8; text-align: left; line-height: 1.6; margin: 0 0 15px 0;">
        ${emailIntro}
      </p>
      <div class="otp-box">
        <div class="otp-code">${otpCode}</div>
        <div class="expiry">⏱ Valid for 15 minutes &bull; Requested at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
      </div>
      <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px; padding: 10px 14px; margin: 15px 0; text-align: left; font-size: 12px; color: #fbbf24; line-height: 1.4;">
        ⚠️ <strong>Important Notice:</strong> If you requested multiple OTP codes, please be sure to enter this newest code. All previous codes have been superseded and expired.
      </div>
      <div class="notice">
        ${emailSecurityNotice}
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} PROJECT: PACE Z-LICZ. All rights reserved.
    </div>
  </div>
</body>
</html>
`;

async function sendMail() {
    try {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // TLS
            auth: {
                user: gmailUser,
                pass: gmailPassword,
            },
        });

        const subjectStr = isLogin
            ? `PROJECT: PACE Z-LICZ: Login Verification Code [${otpCode}] (${timeStr})`
            : `PROJECT: PACE Z-LICZ: Password Reset OTP Code [${otpCode}] (${timeStr})`;
        const textStr = isLogin
            ? `PROJECT: PACE Z-LICZ: Your login verification code is ${otpCode}. Requested at ${timeStr}. Valid for 15 minutes only.`
            : `PROJECT: PACE Z-LICZ: Your password reset verification code is ${otpCode}. Requested at ${timeStr}. Valid for 15 minutes only.`;

        const info = await transporter.sendMail({
            from: `"PROJECT: PACE Z-LICZ" <${gmailUser}>`,
            to: toEmail,
            subject: subjectStr,
            html: htmlTemplate,
            text: textStr,
        });

        console.log(JSON.stringify({
            success: true,
            provider: 'nodemailer-gmail',
            messageId: info.messageId,
            recipient: toEmail
        }));
        process.exit(0);
    } catch (err) {
        console.error(JSON.stringify({
            success: false,
            error: err.message || 'Failed to send email via Nodemailer Gmail SMTP.'
        }));
        process.exit(1);
    }
}

sendMail();
