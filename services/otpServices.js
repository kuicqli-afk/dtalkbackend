// backend/services/otpService.js
const axios = require('axios');

// ============================================
// MUZZTECH OTP SERVICE
// ============================================
const sendOTPviaMuzztech = async (phone, otp) => {
  try {
    // Muzztech REST API endpoint
    const response = await axios.post(
      'https://api.muzztech.com/v1/send',
      {
        to: `91${phone}`,  // Country code + phone
        message: `Your Kuickli Chat OTP is: ${otp}`,
        sender: process.env.MUZZTECH_SENDER_ID || 'KUICKLI'
      },
      {
        headers: {
          'X-Api-Key': process.env.MUZZTECH_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Muzztech OTP sent:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Muzztech OTP failed:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
};

// ============================================
// MAIN OTP SENDER
// ============================================
const sendOTP = async (phone, otp) => {
  const provider = process.env.OTP_PROVIDER || 'muzztech';

  console.log(`📱 Sending OTP via ${provider} to ${phone}`);

  switch (provider.toLowerCase()) {
    case 'muzztech':
      return await sendOTPviaMuzztech(phone, otp);
    case 'console':
    default:
      console.log(`📱 [DEMO] OTP for ${phone}: ${otp}`);
      return { success: true, message: 'OTP logged to console' };
  }
};

module.exports = { sendOTP };