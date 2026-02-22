# إعداد الإيميل (Gmail) حتى يوصّل الكود للبريد

إذا الكود ما عم يوصل على بريدك، اتبعي هالخطوات:

## 1. تفعيل التحقق بخطوتين (2FA)
- ادخلي على [حساب Google](https://myaccount.google.com)
- الأمان → التحقق بخطوتين → فعّليها

## 2. إنشاء "كلمة مرور التطبيقات"
- من [حساب Google](https://myaccount.google.com) → الأمان
- أو ادخلي مباشرة: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
- اختاري "البريد" والجهاز "كمبيوتر" ثم إنشاء
- انسخي الرمز اللي يظهر (١٦ حرف، ممكن يظهر بشكل: xxxx xxxx xxxx xxxx)

## 3. تعديل ملف `.env`
- افتحي ملف `.env` بمجلد الباكند
- تأكدي إنه هالسطر موجود **بين علامتي تنصيص** إذا الرمز فيه مسافات:
```env
EMAIL_PASS="xxxx xxxx xxxx xxxx"
```
- أو بدون مسافات (١٦ حرف متتالي):
```env
EMAIL_PASS=abcdefghijklmnop
```
- والباقي:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=راجيد_الإيميل@gmail.com
FROM_EMAIL="Dress Shop <راجيد_الإيميل@gmail.com>"
```

## 4. إعادة تشغيل السيرفر
- أوقفي السيرفر (Ctrl+C) وشغّليه من جديد: `node server.js`
- أول ما يطلب التطبيق إرسال كود، راح يظهر في الكونسول إذا الاتصال بالإيميل شغال أو لا

## 5. إذا البريد ما واصل
- **تحققي من مجلد السبام** (Spam) والبريد المزعج (Junk)
- **راجعي كونسول السيرفر**: راح يطبع الرمز (OTP) كل مرة، مثلاً: `[Email] OTP for xxx@gmail.com -> 123456` — استخدمي هذا الرمز في التطبيق للتجربة
- إذا ظهر `[Email] SMTP verification FAILED` أو `Send FAILED`: الرجاء تصحيح كلمة مرور التطبيقات أو التأكد من تفعيل 2FA
