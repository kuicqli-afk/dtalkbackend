const Conversation = require('../models/message');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Keywords check for human support
const needsHuman = (message) => {
  const text = message.toLowerCase().trim();
  const humanKeywords = ['shopkeeper', 'owner', 'admin', 'human', 'order karna', 'order dena', 'discount', 'refund'];
  return humanKeywords.some((keyword) => text.includes(keyword));
};

// ==========================================
// 1. SEND MESSAGE (Supports Reply & Ticks)
// ==========================================
exports.sendMessage = async (req, res) => {
  try {
    const { message, sessionId, userId = 'anonymous', recipientId = null, mediaUrl, type = 'text', replyTo, socketId } = req.body;
    const cleanText = message?.trim() || '';

    if (!cleanText && !mediaUrl) {
      return res.status(400).json({ success: false, error: 'Message or media is required' });
    }

    const currentSessionId = sessionId || userId;

    let conversation = await Conversation.findOne({ sessionId: currentSessionId });
    if (!conversation) {
      conversation = new Conversation({
        sessionId: currentSessionId,
        userId,
        recipientId,
        status: 'ai_active',
        messages: []
      });
    }

    const userMessage = {
      senderId: userId,
      senderType: 'customer',
      text: cleanText,
      type: mediaUrl ? 'image' : type,
      mediaUrl: mediaUrl || '',
      delivered: true,
      read: false,
      replyTo: replyTo || null,
      reactions: [],
      timestamp: new Date()
    };

    conversation.messages.push(userMessage);
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await conversation.save();

    const io = req.app.get('io');

    if (conversation.status === 'human_active') {
      if (io && socketId) {
        io.to(currentSessionId).except(socketId).emit('receive_message', userMessage);
      }
      return res.json({ success: true, mode: 'human', messages: conversation.messages });
    }

    const humanRequired = needsHuman(cleanText);

    if (humanRequired || conversation.status === 'pending_human') {
      conversation.status = 'pending_human';
      await conversation.save();

      if (io) {
        io.to(currentSessionId).emit('receive_message', userMessage);
        if (!conversation.humanNotificationSent) {
          conversation.humanNotificationSent = true;
          await conversation.save();
          io.to('admin_room').emit('shopkeeper_attention_required', {
            sessionId: currentSessionId,
            customerId: userId,
            customerMessage: cleanText,
            timestamp: new Date()
          });
        }
      }

      const fallbackText = "Ji, shopkeeper abhi busy hain. Main aapka message un tak pahuncha deta hoon.";
      const botMessage = {
        senderId: 'bot',
        senderType: 'ai',
        text: fallbackText,
        type: 'text',
        delivered: true,
        read: true,
        reactions: [],
        timestamp: new Date()
      };

      conversation.messages.push(botMessage);
      await conversation.save();
      if (io) io.to(currentSessionId).emit('receive_message', botMessage);

      return res.json({ success: true, mode: 'fallback_ai', messages: conversation.messages });
    }

    if (io) io.to(currentSessionId).emit('receive_message', userMessage);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: cleanText || 'Hello' }] }]
      });

      const aiText = response.text || "Main aapki kya sahayata kar sakta hoon?";
      const botMessage = {
        senderId: 'bot',
        senderType: 'ai',
        text: aiText,
        type: 'text',
        delivered: true,
        read: true,
        reactions: [],
        timestamp: new Date()
      };

      conversation.messages.push(botMessage);
      conversation.aiReplyCount = (conversation.aiReplyCount || 0) + 1;
      await conversation.save();

      if (io) io.to(currentSessionId).emit('receive_message', botMessage);
      return res.json({ success: true, mode: 'ai', messages: conversation.messages });

    } catch (aiError) {
      return res.json({ success: true, mode: 'ai_error', messages: conversation.messages });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 2. GET MESSAGES & MARK AS READ (Double Blue Ticks)
// ==========================================
exports.getMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const conversation = await Conversation.findOne({ sessionId });

    if (!conversation) return res.json({ success: true, messages: [] });

    // Mark all as read (WhatsApp double blue tick trigger when chat opens)
    conversation.messages.forEach(msg => {
      msg.read = true;
      msg.delivered = true;
    });
    conversation.unreadCount = 0;
    await conversation.save();

    const io = req.app.get('io');
    if (io) {
      io.to(sessionId).emit('messages_read', { sessionId }); // Frontend ko notify karne ke liye
    }

    res.json({ success: true, sessionId: conversation.sessionId, status: conversation.status, messages: conversation.messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 3. ADD EMOJI REACTION TO A MESSAGE
// ==========================================
exports.addReaction = async (req, res) => {
  try {
    const { sessionId, messageId, emoji, userId } = req.body;

    const conversation = await Conversation.findOne({ sessionId });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

    const message = conversation.messages.id(messageId);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });

    // Check if user already reacted, update it or push new reaction
    const existingReactionIndex = message.reactions.findIndex(r => r.userId === userId);
    if (existingReactionIndex > -1) {
      message.reactions[existingReactionIndex].emoji = emoji;
    } else {
      message.reactions.push({ userId, emoji });
    }

    await conversation.save();

    const io = req.app.get('io');
    if (io) {
      io.to(sessionId).emit('message_reacted', { messageId, reactions: message.reactions });
    }

    res.json({ success: true, message: 'Reaction added', reactions: message.reactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Other standard controllers like adminReply, clearConversations remain the same...
exports.getConversations = async (req, res) => {
  const list = await Conversation.find().sort({ updatedAt: -1 });
  res.json({ success: true, conversations: list });
};

// ==========================================
// Updated adminReply (Supports Media/Images)
// ==========================================
exports.adminReply = async (req, res) => {
  try {
    const { sessionId, text, adminId, replyTo, mediaUrl, url, image, type } = req.body;

    let conversation = await Conversation.findOne({ sessionId });
    if (!conversation) return res.status(404).json({ success: false, error: 'Not found' });

    const cleanText = text?.trim() || '';
    const finalMedia = mediaUrl || url || image || '';

    console.log("📸 ADMIN REPLY:", {
      text,
      mediaUrl,
      url,
      image,
      finalMedia,
      type
    });

    if (!cleanText && !finalMedia) {
      return res.status(400).json({ success: false, error: 'Message or media is required' });
    }

    const adminMessage = {
      senderId: adminId || 'admin',
      senderType: 'admin',
      text: cleanText,
      type: finalMedia ? 'image' : (type || 'text'),
      mediaUrl: finalMedia,
      delivered: true,
      read: false,
      replyTo: replyTo || null,
      reactions: [],
      timestamp: new Date()
    };

    conversation.messages.push(adminMessage);
    conversation.status = 'human_active';
    conversation.humanNotificationSent = false;
    await conversation.save();

    const io = req.app.get('io');
    if (io) io.to(sessionId).emit('receive_message', adminMessage);

    res.json({ success: true, message: adminMessage });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.clearChat = async (req, res) => {
  await Conversation.findOneAndUpdate({ sessionId: req.params.sessionId }, { $set: { messages: [] } });
  res.json({ success: true, message: 'Cleared' });
};

exports.deleteSession = async (req, res) => {
  await Conversation.findOneAndDelete({ sessionId: req.params.sessionId });
  res.json({ success: true, message: 'Deleted' });
};// ==========================================
// 4. DELETE A SINGLE MESSAGE
// ==========================================
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ Delete message request:", id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Message ID is required",
      });
    }

    // Find the conversation containing this embedded message
    const conversation = await Conversation.findOne({
      "messages._id": id,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    const message = conversation.messages.id(id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found in conversation",
      });
    }

    const sessionId = conversation.sessionId;

    // Remove embedded message
    message.deleteOne();

    await conversation.save();

    console.log("✅ Message deleted:", id);

    // Notify other connected clients
    const io = req.app.get("io");

    if (io && sessionId) {
      io.to(sessionId).emit("message-deleted", {
        messageId: id,
        sessionId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Message deleted successfully",
      messageId: id,
      sessionId,
    });
  } catch (error) {
    console.error("❌ Delete message error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete message",
      error: error.message,
    });
  }
};