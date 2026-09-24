const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  uploader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  type: {
    type: String,
    enum: ['image', 'video', 'audio', 'document'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  fileName: String,
  mimeType: String,
  size: Number,          // bytes mein
  duration: Number,       // sirf audio/video ke liye (seconds)
  thumbnailUrl: String,   // video/image ke liye chhoti preview
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Media', mediaSchema);