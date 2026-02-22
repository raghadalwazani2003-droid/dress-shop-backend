// email.js
const nodemailer = require('nodemailer')
require('dotenv').config()

// Trim so .env values with/without quotes work (e.g. EMAIL_PASS="xxxx xxxx xxxx xxxx")
const emailUser = (process.env.EMAIL_USER || '').trim()
const emailPass = (process.env.EMAIL_PASS || '').trim()
const hasEmailConfig = Boolean(
  process.env.EMAIL_HOST &&
  emailUser &&
  emailPass
)

const transporter = hasEmailConfig
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs for local dev
      },
    })
  : null

// Log config status on load (no secrets)
if (!hasEmailConfig) {
  console.warn('[Email] Not configured: set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env')
} else if (emailPass.length < 10) {
  console.warn('[Email] EMAIL_PASS looks wrong (too short). Use Gmail App Password and put it in quotes if it has spaces: EMAIL_PASS="xxxx xxxx xxxx xxxx"')
}

/** Verify SMTP connection on first use and log result */
let verified = false
let verificationFailed = false
async function verifyConnection() {
  if (verified || !transporter) {
    if (verificationFailed) throw new Error('SMTP connection failed. Check EMAIL_USER and EMAIL_PASS in .env')
    return
  }
  try {
    await transporter.verify()
    verified = true
    console.log('[Email] SMTP connection OK. Emails should be sent to inbox (check spam if not).')
  } catch (err) {
    verificationFailed = true
    console.error('[Email] SMTP verification FAILED:', err.message)
    console.error('[Email] Fix: 1) Enable 2FA on Gmail 2) Create App Password at myaccount.google.com/apppasswords 3) In .env use EMAIL_PASS="xxxx xxxx xxxx xxxx" (with quotes). If still fails, try the 16 letters without spaces: EMAIL_PASS="abcdefghijklmnop"')
    if (err.response) console.error('[Email] Response:', err.response)
    throw new Error(`SMTP verification failed: ${err.message}`)
  }
}

async function sendOtpEmail(to, otp) {
  const fromAddress = (process.env.FROM_EMAIL || '').trim() || `MOTEX <${emailUser}>`
  console.log('[Email] OTP for', to, '->', otp, '(إذا ما وصل البريد، انسخي الرمز من هنا)')

  if (!transporter) {
    console.warn('[Email] Skipping send - not configured. Use OTP above to test.')
    throw new Error('Email not configured. Check EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env')
  }
  await verifyConnection()
  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: to.trim(),
      subject: 'كود تفعيل حسابك في MOTEX',
      text: `كود التفعيل الخاص بك هو: ${otp} (صالح لمدة 10 دقائق)`,
      html: `
      <div dir="rtl" style="font-family:Arial,sans-serif">
        <h2>مرحبًا 👋</h2>
        <p>كود التفعيل الخاص بك هو:</p>
        <p style="font-size:24px;font-weight:bold">${otp}</p>
        <p>الكود صالح لمدة 10 دقائق فقط.</p>
      </div>
    `,
    })
    console.log('[Email] Sent successfully to', to, '| messageId:', info.messageId)
  } catch (err) {
    console.error('[Email] Send FAILED:', err.message)
    if (err.code) console.error('[Email] Error code:', err.code)
    if (err.response) console.error('[Email] Response:', err.response)
    console.log('>>> استخدمي هذا الرمز في التطبيق:', otp, '<<<')
    throw err
  }
}

// تصدير كائن يحتوي على الدالة
module.exports = {
  sendOtpEmail,
}
