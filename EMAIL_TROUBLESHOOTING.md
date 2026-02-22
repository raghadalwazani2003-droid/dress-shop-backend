# Email OTP Troubleshooting Guide

If OTP codes are not being sent to email, follow these steps:

## 1. Check Server Console

When you request an OTP, check the **backend server console** (terminal where `node server.js` is running). You should see:

```
[send-email-otp] Generating OTP for user@email.com, purpose: login
[send-email-otp] OTP code: 123456 (also check server console if email fails)
[Email] OTP for user@email.com -> 123456
[Email] Sent successfully to user@email.com | messageId: ...
```

**If you see the OTP code in console** → Email sending failed, but you can use the code from console to test.

## 2. Test Email Configuration

Visit in browser:
```
http://localhost:4000/auth/test-email?email=your@email.com
```

This will:
- Show if email config is correct
- Send a test email
- Display the OTP code even if email fails

## 3. Check .env File

Open `dress-shop-backend/.env` and verify:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS="your-16-char-app-password"
FROM_EMAIL="Dress Shop <your@gmail.com>"
```

**Important:** 
- `EMAIL_PASS` must be a **Gmail App Password** (not your regular Gmail password)
- Gmail App Passwords are **16 characters** and should be entered **without spaces** (even though Gmail displays them as "xxxx xxxx xxxx xxxx")
- Example: If Gmail shows `fefm efbn hvcq gkgz`, use `EMAIL_PASS="fefmefbnhvcqgkgz"` (no spaces)

## 4. Create Gmail App Password

1. Go to [Google Account](https://myaccount.google.com)
2. **Security** → **2-Step Verification** → Enable it
3. **Security** → **App passwords** → Create new
4. Select **Mail** and **Other (Custom name)** → Enter "MOTEX Backend"
5. Copy the **16-character password** (no spaces)
6. In `.env`: `EMAIL_PASS="paste-16-chars-here"`
7. **Restart the backend server**

## 5. Common Errors

### "SMTP verification FAILED" or "EAUTH"
- **Cause:** Wrong EMAIL_PASS or 2FA not enabled
- **Fix:** Create new App Password, ensure 2FA is enabled, restart server

### "Email not configured"
- **Cause:** Missing EMAIL_HOST, EMAIL_USER, or EMAIL_PASS in .env
- **Fix:** Add all three to .env, restart server

### Email sent but not received
- Check **Spam/Junk** folder
- Check server console for `messageId` - if present, email was sent successfully
- Gmail may delay emails from new senders

## 6. Use OTP from Console

Even if email fails, the **OTP code is always printed in the server console**. You can:
1. Copy the code from console (e.g., `OTP code: 123456`)
2. Use it in the app to complete the flow
3. Fix email config while testing

## 7. Verify Email is Working

After fixing `.env`, restart server and check startup logs:
```
📧 Email config: Host set | User set | Pass set
```

Then test:
```
GET http://localhost:4000/auth/test-email?email=your@email.com
```

If successful, you'll see: `Test email sent. Check inbox...`
