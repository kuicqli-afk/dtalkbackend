const mongoose = require('mongoose');

// ==========================================
// REACTION SUB-SCHEMA (emoji reactions on a message)
// ==========================================
const reactionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    emoji: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// ==========================================
// REPLY-TO SUB-SCHEMA (quoted/replied message preview)
// ==========================================
const replyToSchema = new mongoose.Schema(
  {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    text: {
      type: String,
      default: '',
    },
    sender: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      default: 'text',
    },
    image: {
      type: String,
      default: '',
    },
    url: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    mediaUrl: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

// ==========================================
// MESSAGE SUB-SCHEMA (one chat message, embedded)
// ==========================================
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
    },
    senderType: {
      type: String,
      enum: ['customer', 'admin', 'ai'],
      required: true,
    },
    text: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'file', 'media-uploading'],
      default: 'text',
    },
    mediaUrl: {
      type: String,
      default: '',
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    replyTo: {
      type: replyToSchema,
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// ==========================================
// CONVERSATION SCHEMA (one per sessionId, holds all messages)
// ==========================================
const conversationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
    },
    recipientId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['ai_active', 'pending_human', 'human_active'],
      default: 'ai_active',
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    aiReplyCount: {
      type: Number,
      default: 0,
    },
    humanNotificationSent: {
      type: Boolean,
      default: false,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  { timestamps: true } // adds createdAt & updatedAt on the conversation itself
);

module.exports = mongoose.model('Conversation', conversationSchema);