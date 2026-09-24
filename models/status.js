const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mediaUrl: { type: String },
  caption: { type: String },
  type: { type: String, enum: ['image', 'video', 'text'], default: 'text' },
  backgroundColor: { type: String },
  createdAt: { type: Date, default: Date.now, expires: 86400 } 
});

module.exports = mongoose.model('Status', statusSchema);