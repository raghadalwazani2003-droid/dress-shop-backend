// email.js
const nodemailer = require('nodemailer')
require('dotenv').config()

// ==================== قراءة المتغيرات من .env ====================
const emailHost = (process.env.EMAIL_HOST || '').trim()
const emailUser = (process.env.EMAIL_USER || '').trim()
const emailPass = (process.env.EMAIL_PASS || '').trim()
const emailPort = Number(process.env.EMAIL_PORT) || 465
const emailSecure = process.env.EMAIL_SECURE === 'true'
const fromAddress = (process.env.FROM_EMAIL || '').trim() || `MOTEX <${emailUser}>`

const hasEmailConfig = Boolean(emailHost && emailUser && emailPass)

if (!hasEmailConfig) {
  console.warn('[Email] Not configured: set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env')
} else if (emailPass.length < 10) {
  console.warn('[Email] EMAIL_PASS looks too short. Use Gmail App Password and quotes if needed: EMAIL_PASS="abcdefghijklmnop"')
}

// ==================== انشاء Transporter ====================
const transporter = hasEmailConfig
  ? nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailSecure, // true=465, false=587
      requireTLS: true,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        rejectUnauthorized: false, // يسمح لشهادات self-signed في التطوير
      },
    })
  : null

// ==================== تحقق من الاتصال مرة واحدة ====================
let verified = false
let verificationFailed = false

function mask(str = '') {
  if (!str) return ''
  if (str.length <= 4) return '****'
  return str.slice(0, 2) + '****' + str.slice(-2)
}

async function verifyConnection(retries = 2) {
  if (!transporter) throw new Error('Email not configured. Check EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env')
  if (verified) return
  if (verificationFailed) throw new Error('SMTP connection failed. Check EMAIL_USER and EMAIL_PASS')

  let lastErr = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[Email] verifying SMTP (attempt ${attempt + 1}/${retries + 1}) - host=${emailHost} user=${mask(emailUser)}`)
      await transporter.verify()
      verified = true
      verificationFailed = false
      console.log('[Email] SMTP connection OK. Emails should be sent to inbox (check spam if not).')
      return
    } catch (err) {
      lastErr = err
      console.error('[Email] SMTP verification attempt failed:', err && err.message)
      // small backoff before retry
      if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }

  verificationFailed = true
  console.error('[Email] SMTP verification FAILED after retries:', lastErr && lastErr.message)
  console.error('[Email] Fix suggestions:')
  console.error(' - Ensure EMAIL_HOST, EMAIL_USER, EMAIL_PASS are set in the environment')
  console.error(' - For Gmail: enable 2FA and create an App Password at myaccount.google.com/apppasswords')
  console.error(' - If using a third-party provider, verify host, port, secure settings, and network access')
  if (lastErr && lastErr.response) console.error('[Email] Response:', lastErr.response)
  throw new Error(`SMTP verification failed: ${lastErr && lastErr.message}`)
}

// ==================== دالة إرسال OTP ====================
async function sendOtpEmail(to, otp) {
  if (!transporter) {
    console.warn('[Email] Skipping send - not configured. OTP:', otp)
    throw new Error('Email not configured. Check EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env')
  }

  console.log('[Email] OTP for', to, '->', otp, '(إذا ما وصل البريد، انسخي الرمز من هنا)')

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

// ==================== تصدير الدالة ====================
module.exports = {
  sendOtpEmail,
  verifyConnection,
  hasEmailConfig,
}