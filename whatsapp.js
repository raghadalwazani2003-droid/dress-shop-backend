const twilio = require('twilio')
require('dotenv').config()

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

async function sendWhatsAppCode(toPhone, otp) {
  const to = `whatsapp:${toPhone}`
  const from = process.env.TWILIO_WHATSAPP_FROM

  const message = await client.messages.create({
    from,
    to,
    body: `كود التحقق الخاص بك هو: ${otp} (صالح لمدة 10 دقائق)`,
  })

  console.log('WhatsApp message sent:', message.sid)
}

module.exports = { sendWhatsAppCode }
