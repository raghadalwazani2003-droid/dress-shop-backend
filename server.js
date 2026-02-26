require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

// Firebase Admin
const admin = require('firebase-admin')
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()
const usersCollection = db.collection('users')
const emailOtpsCollection = db.collection('emailOtps')

// Email sender
const { sendOtpEmail } = require('./email')

const OTP_EXPIRY_MS = 5 * 60 * 1000
const OTP_RESEND_COOLDOWN_MS = 60 * 1000
const MAX_RESEND_PER_EMAIL = 10

const app = express()

// Security & performance
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
app.use(express.json({ limit: '10mb' }))

// CORS - allow frontend
const allowedOrigins = [
  "http://localhost:3000",                     // للاختبار محلي
  "https://dress-shop-ten.vercel.app"         // الدومين الصحيح للفرونت
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin not allowed"));
    }
  },
  credentials: true
}));


// Health check
app.get("/", (req, res) => {
  res.send("Backend is running 🚀")
})

// توليد OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * 1) بدء التسجيل (Email فقط)
 * body: { email, password }
 */
app.post('/auth/register/start', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required' })
    }

    const userRef = usersCollection.doc(email)
    const userDoc = await userRef.get()
    const userData = userDoc.exists ? userDoc.data() : null

    if (userData && userData.isVerified) {
      return res.status(400).json({ message: 'هذا الإيميل مسجّل من قبل' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const otp = generateOtp()
    const expires = new Date(Date.now() + 10 * 60 * 1000)

    const payload = {
      email,
      passwordHash,
      isVerified: false,
      emailOtp: otp,
      emailOtpExpiresAt: expires.toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    await userRef.set(payload, { merge: true })
    await sendOtpEmail(email, otp)

    return res.json({ message: 'تم إرسال كود التفعيل إلى الإيميل' })
  } catch (err) {
    console.error('register/start error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * 2) تأكيد OTP
 * body: { email, otp }
 */
app.post('/auth/register/verify', async (req, res) => {
  try {
    const { email, otp } = req.body

    if (!email || !otp) {
      return res
        .status(400)
        .json({ message: 'Email and OTP are required' })
    }

    const userRef = usersCollection.doc(email)
    const userDoc = await userRef.get()

    if (!userDoc.exists) {
      return res.status(400).json({ message: 'المستخدم غير موجود' })
    }

    const userData = userDoc.data()

    if (!userData.emailOtp || !userData.emailOtpExpiresAt) {
      return res.status(400).json({ message: 'لا يوجد كود نشط' })
    }

    if (userData.emailOtp !== otp) {
      return res.status(400).json({ message: 'الكود غير صحيح' })
    }

    if (new Date(userData.emailOtpExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'انتهت صلاحية الكود' })
    }

    await userRef.update({
      isVerified: true,
      emailOtp: admin.firestore.FieldValue.delete(),
      emailOtpExpiresAt: admin.firestore.FieldValue.delete(),
    })

    const token = jwt.sign(
      {
        userId: email,
        email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({
      message: 'تم تفعيل الحساب بنجاح',
      token,
      user: {
        id: email,
        email,
      },
    })
  } catch (err) {
    console.error('register/verify error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * 3) تسجيل الدخول (Email فقط)
 * body: { email, password }
 */
app.post('/auth/login', async (req, res) => {
  try {
    console.log('LOGIN BODY:', req.body)

    const { email, password } = req.body

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required' })
    }

    const userRef = usersCollection.doc(email)
    const userDoc = await userRef.get()

    if (!userDoc.exists) {
      return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' })
    }

    const userData = userDoc.data()

    if (!userData.isVerified) {
      return res.status(403).json({
        message: 'الحساب غير مفعّل، فعّل الإيميل أولاً',
      })
    }

    const isMatch = await bcrypt.compare(password, userData.passwordHash)
    if (!isMatch) {
      return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' })
    }

    const token = jwt.sign(
      {
        userId: email,
        email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: email,
        email,
      },
    })
  } catch (err) {
    console.error('login error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * 4) بدء عملية نسيت كلمة السر (Email فقط)
 * body: { email }
 */
app.post('/auth/forgot-password/start', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const userRef = usersCollection.doc(email)
    const userDoc = await userRef.get()

    if (!userDoc.exists) {
      return res.json({
        message: 'إذا كان الإيميل مسجلاً سيتم إرسال كود',
      })
    }

    const otp = generateOtp()
    const expires = new Date(Date.now() + 10 * 60 * 1000)

    await userRef.set(
      {
        resetOtp: otp,
        resetOtpExpiresAt: expires.toISOString(),
      },
      { merge: true }
    )

    await sendOtpEmail(email, otp)

    return res.json({
      message: 'تم إرسال كود إعادة التعيين إلى الإيميل',
    })
  } catch (err) {
    console.error('forgot-password/start error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * 5) تأكيد كود نسيت كلمة السر وتعيين باسورد جديد
 * body: { email, otp, newPassword }
 */
app.post('/auth/forgot-password/verify', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        message: 'Email, OTP and new password are required',
      })
    }

    const userRef = usersCollection.doc(email)
    const userDoc = await userRef.get()

    if (!userDoc.exists) {
      return res.status(400).json({ message: 'المستخدم غير موجود' })
    }

    const userData = userDoc.data()

    if (!userData.resetOtp || !userData.resetOtpExpiresAt) {
      return res.status(400).json({ message: 'لا يوجد كود نشط' })
    }

    if (userData.resetOtp !== otp) {
      return res.status(400).json({ message: 'الكود غير صحيح' })
    }

    if (new Date(userData.resetOtpExpiresAt) < new Date()) {
      return res
        .status(400)
        .json({ message: 'انتهت صلاحية الكود، أعد الإرسال' })
    }

    const newHash = await bcrypt.hash(newPassword, 12)

    await userRef.set(
      {
        passwordHash: newHash,
        resetOtp: admin.firestore.FieldValue.delete(),
        resetOtpExpiresAt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    )

    return res.json({ message: 'تم تغيير كلمة السر بنجاح' })
  } catch (err) {
    console.error('forgot-password/verify error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * Send email OTP (generic: login, register, reset)
 * body: { email, purpose? }  purpose: 'login' | 'register' | 'reset'
 * - Generates 6-digit OTP, hashes with bcrypt, stores in Firestore (emailOtps)
 * - 5 min expiry, 60s resend cooldown, max resends per email
 */
app.post('/auth/send-email-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const purpose = (req.body.purpose || 'login').toLowerCase()

    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' })
    }

    const otpRef = emailOtpsCollection.doc(email)
    const existing = await otpRef.get()
    const data = existing.exists ? existing.data() : null
    const now = Date.now()

    if (data && data.lastSentAt) {
      const elapsed = now - data.lastSentAt
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)
        return res.status(429).json({
          message: 'Please wait before resending',
          retryAfterSeconds: waitSec,
        })
      }
      if ((data.resendCount || 0) >= MAX_RESEND_PER_EMAIL) {
        return res.status(429).json({ message: 'Too many attempts. Try again later.' })
      }
    }

    const otp = generateOtp()
    const otpHash = await bcrypt.hash(otp, 10)
    const expiresAt = new Date(now + OTP_EXPIRY_MS)

    console.log(`[send-email-otp] Generating OTP for ${email}, purpose: ${purpose}`)
    console.log(`[send-email-otp] OTP code: ${otp} (also check server console if email fails)`)

    await otpRef.set({
      otpHash,
      expiresAt: expiresAt.toISOString(),
      purpose,
      lastSentAt: now,
      resendCount: (data?.resendCount || 0) + 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    console.log(`[send-email-otp] OTP saved to Firestore. Attempting to send email...`)
    await sendOtpEmail(email, otp)
    console.log(`[send-email-otp] Email send completed for ${email}`)

    return res.json({
      message: 'OTP sent to your email',
      expiresIn: Math.floor(OTP_EXPIRY_MS / 1000),
    })
  } catch (err) {
    console.error('[send-email-otp] Error:', err.message || err)
    if (err.code) console.error('[send-email-otp] Error code:', err.code)
    if (err.response) console.error('[send-email-otp] Response:', err.response)
    
    // Get OTP from Firestore to show user (if it was saved)
    try {
      const otpRef = emailOtpsCollection.doc(String(req.body.email || '').trim().toLowerCase())
      const saved = await otpRef.get()
      if (saved.exists) {
        console.log('[send-email-otp] OTP was saved to database. Check Firestore emailOtps collection for the code.')
      }
    } catch (_) {}
    
    const msg = err.message?.includes('not configured') 
      ? 'Email service not configured. Check server logs.'
      : err.message?.includes('authentication') || err.code === 'EAUTH' || err.code === 'EENVELOPE'
        ? 'Email authentication failed. Check EMAIL_USER and EMAIL_PASS in .env. Make sure EMAIL_PASS is a Gmail App Password (16 characters, no spaces).'
        : 'Failed to send email. Check server console for OTP code and error details.'
    return res.status(500).json({ message: msg })
  }
})

/**
 * Verify email OTP
 * body: { email, otp, purpose? }
 * - Checks expiry, compares hashed OTP
 * - Deletes OTP doc on success
 * - If purpose=login and user exists, returns token + user
 */
app.post('/auth/verify-email-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const otp = String(req.body.otp || '').trim()
    const purpose = (req.body.purpose || 'login').toLowerCase()

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' })
    }

    const otpRef = emailOtpsCollection.doc(email)
    const otpDoc = await otpRef.get()

    if (!otpDoc.exists) {
      return res.status(400).json({ message: 'No OTP found. Request a new code.' })
    }

    const data = otpDoc.data()
    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
    if (!expiresAt || expiresAt < new Date()) {
      await otpRef.delete()
      return res.status(400).json({ message: 'OTP expired. Request a new code.' })
    }

    const match = await bcrypt.compare(otp, data.otpHash)
    if (!match) {
      return res.status(400).json({ message: 'Invalid code' })
    }

    await otpRef.delete()

    if (purpose === 'login') {
      const userRef = usersCollection.doc(email)
      const userSnap = await userRef.get()
      if (userSnap.exists && userSnap.data().isVerified) {
        const token = jwt.sign(
          { userId: email, email },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        )
        return res.json({
          message: 'Verified',
          verified: true,
          token,
          user: { id: email, email },
        })
      }
    }

    if (purpose === 'register') {
      const registerToken = jwt.sign(
        { email, purpose: 'register' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      )
      return res.json({ message: 'Verified', verified: true, registerToken })
    }

    return res.json({ message: 'Verified', verified: true })
  } catch (err) {
    console.error('verify-email-otp error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

/**
 * Complete registration after email OTP verified (set password, create user)
 * body: { registerToken, password }
 */
app.post('/auth/register/complete', async (req, res) => {
  try {
    const { registerToken, password } = req.body
    if (!registerToken || !password) {
      return res.status(400).json({ message: 'Token and password are required' })
    }
    let payload
    try {
      payload = jwt.verify(registerToken, process.env.JWT_SECRET)
    } catch (_) {
      return res.status(400).json({ message: 'Invalid or expired link. Verify your email again.' })
    }
    if (payload.purpose !== 'register' || !payload.email) {
      return res.status(400).json({ message: 'Invalid token' })
    }
    const email = String(payload.email).trim().toLowerCase()
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }
    const userRef = usersCollection.doc(email)
    const existing = await userRef.get()
    if (existing.exists && existing.data().isVerified) {
      return res.status(400).json({ message: 'Email already registered' })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    await userRef.set({
      email,
      passwordHash,
      isVerified: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    const token = jwt.sign(
      { userId: email, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    return res.json({
      message: 'Account created',
      token,
      user: { id: email, email },
    })
  } catch (err) {
    console.error('register/complete error:', err)
    return res.status(500).json({ message: 'Server error' })
  }
})

app.get('/', (req, res) => {
  res.send('Auth server running (Email only)')
})

/**
 * Test email configuration (dev only)
 * GET /auth/test-email?email=your@email.com
 * - Generates 6-digit OTP
 * - Sends via Gmail SMTP
 * - Returns OTP in response (even if email fails)
 */
app.get('/auth/test-email', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase()
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ 
      success: false,
      message: 'Provide ?email=your@email.com',
      example: `${process.env.BASE_URL || ''}/auth/test-email?email=your@email.com`
    })
  }
  
  // Generate 6-digit OTP before try-catch so it's accessible in both blocks
  const testOtp = generateOtp()
  console.log(`[test-email] ========================================`)
  console.log(`[test-email] Testing email to: ${email}`)
  console.log(`[test-email] Generated OTP: ${testOtp}`)
  console.log(`[test-email] ========================================`)
  
  try {
    console.log(`[test-email] Attempting to send email...`)
    await sendOtpEmail(email, testOtp)
    console.log(`[test-email] ✅ Email sent successfully`)
    return res.json({ 
      success: true,
      message: 'Test email sent successfully. Check inbox (and spam folder).',
      otp: testOtp,
      email: email,
      note: 'OTP code is also logged in server console above.'
    })
  } catch (err) {
    console.error(`[test-email] ❌ Email send FAILED:`)
    console.error(`[test-email] Error: ${err.message}`)
    if (err.code) console.error(`[test-email] Code: ${err.code}`)
    if (err.response) console.error(`[test-email] Response:`, err.response)
    console.log(`[test-email] ========================================`)
    console.log(`[test-email] >>> OTP CODE FOR TESTING: ${testOtp} <<<`)
    console.log(`[test-email] ========================================`)
    
    return res.status(500).json({ 
      success: false,
      message: 'Email sending failed, but OTP code is available below for testing',
      error: err.message,
      errorCode: err.code || null,
      otp: testOtp,
      email: email,
      troubleshooting: {
        checkEnv: 'Verify EMAIL_USER and EMAIL_PASS in .env',
        gmailAppPassword: 'Gmail App Password should be 16 characters without spaces',
        enable2FA: 'Enable 2-Step Verification on Gmail account',
        createAppPassword: 'Create App Password at myaccount.google.com/apppasswords',
        restartServer: 'Restart server after changing .env'
      }
    })
  }
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err?.message || err)
  res.status(500).json({ message: 'Server error' })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Email config: ${process.env.EMAIL_HOST ? 'OK' : 'MISSING'} | ${process.env.EMAIL_USER ? 'OK' : 'MISSING'} | ${process.env.EMAIL_PASS ? 'OK' : 'MISSING'}`)
  }
})
