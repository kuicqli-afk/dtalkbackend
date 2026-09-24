
  const mongoose = require('mongoose');

  const UserSchema = new mongoose.Schema({

    // =========================
    // BASIC USER INFO
    // =========================
    name: {
      type: String,
      required: true,
      trim: true
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true
    },

    phone: {
      type: String,
      required: true,
      unique: true
    },

    // =========================
    // USER ROLE
    // =========================
    role: {
      type: String,
      enum: ['shopkeeper', 'customer'],
      default: 'customer',
      required: true
    },

    // =========================
    // PROFILE
    // =========================
    avatar: {
      type: String,
      default: ''
    },

    bio: {
      type: String,
      default: ''
    },

    status: {
      type: String,
      default: 'Hey there! I am using Kuicqli Chat'
    },

    // =========================
    // ONLINE STATUS
    // =========================
    isOnline: {
      type: Boolean,
      default: false
    },
  // =========================
  // VERIFICATION STATUS
  // =========================

    isVerified: {
    type: Boolean,
    default: false,
  },
  
    // =========================
    // OTP
    // =========================
    otp: {
      code: String,
      expiresAt: Date
    },

  }, {
    timestamps: true
  });

  module.exports = mongoose.model('User', UserSchema);

