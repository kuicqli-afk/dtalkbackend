// backend/server.js
require('dotenv').config();

console.log("Cloudinary Config:", {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const Customer = require('./models/customer');


const statusRoute = require('./routes/statusRoute');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoute = require('./routes/authRoute');


const messageRoute = require('./routes/messageRoute');
const mediaRoute = require('./routes/mediaRoute');

const broadcastRoute = require('./routes/broadcastRoute');
const storeRoute = require("./routes/storeRoute");
const app = express();
const server = http.createServer(app);

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ============================================
// ALLOWED ORIGINS (Frontend Ports & Production)
// ============================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5000',
  'https://admin.shyamnamkeenandbakers.online',
  'https://dtalkbusiness.designerbrids.com',
  'https://dtalkbackend.designerbrids.com',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});
app.set('io', io);

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json());

app.use('/api/status', statusRoute);

// ============================================
// CREATE UPLOADS FOLDER IF NOT EXISTS
// ============================================
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('📁 Uploads folder created');
}


// ============================================
// STATIC FILES (Uploads)
// ============================================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// DATABASE
// ============================================
connectDB();

// ============================================
// ROUTES
// ============================================
app.use('/api/auth', authRoute);

app.use("/api/admin/auth", storeRoute);


app.use('/api/messages', messageRoute);
app.use('/api/media', mediaRoute);
app.use('/api/broadcast', broadcastRoute)
app.use('/api/users', require('./routes/authRoute'));

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: '🚀 Kuickli Chat API',
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

app.get('/', (req, res) => {
  res.send('🚀 Kuickli Chat API is running...');
});

// ============================================
// SOCKET.IO EVENTS
// ============================================
const activeSessions = new Map();

io.on('connection', (socket) => {
  console.log('🟢 Client connected:', socket.id);

  // Register user
  socket.on('register-user', async (userId) => {
    socket.userId = userId;
    activeSessions.set(userId, socket.id);
    console.log(`👤 User ${userId} registered & online`);

    io.emit('user-online', { userId, isOnline: true });

    try {
      // Database status update logic if any
    } catch (error) {
      console.error("Error updating offline status on register:", error);
    }
  });

  // Join a specific chat session room
  socket.on('join_room', (sessionId) => {
    socket.join(sessionId);
    console.log(`💬 Socket ${socket.id} joined room: ${sessionId}`);
  });

  // Track recently processed messages to prevent duplicate triggers
  const recentMessages = new Set();

  socket.on('send_message', async (data) => {
    const { sessionId, text, message, sender = 'user', senderId, recipientId, receiverId } = data;
    const messageText = text || message;

    if (!sessionId || !messageText) return;

    // Deduplication check: Ignore if same message received within 1.5 seconds
    const msgKey = `${sessionId}-${senderId || socket.userId}-${messageText}`;
    if (recentMessages.has(msgKey)) {
      return;
    }
    recentMessages.add(msgKey);
    setTimeout(() => recentMessages.delete(msgKey), 1500);

    // Determine final sender and receiver IDs
    const finalSenderId = senderId || socket.userId;
    const finalReceiverId = receiverId || recipientId;

    try {
      // 1. User message ko Database me Save karein
      const savedUserMessage = await Message.create({
        sessionId: sessionId,
        senderId: finalSenderId,
        receiverId: finalReceiverId,
        text: messageText,
        messageType: 'text'
      });

      const userMsgObj = {
        id: savedUserMessage._id,
        text: savedUserMessage.text,
        sender: 'user',
        timestamp: savedUserMessage.createdAt
      };

      io.to(sessionId).emit('receive_message', userMsgObj);
      console.log(`📨 Message saved & sent in room ${sessionId}:`, messageText);

      // 2. Real Gemini AI Natural Chat Response
      if (sender === 'user') {
        const cleanText = messageText.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu, '');
        if (cleanText.length === 0) return;

        try {
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: `You are Kuicqli, a friendly WhatsApp chat assistant for a shipping and logistics enterprise in Lucknow. 
- If the user greets (like "hi", "hello", "salam", "kaise ho"), greet them back warmly and ask how you can help with their shipping or delivery.
- Match their language (if they write in Hindi/Hinglish, reply in Hindi/Hinglish; if English, reply in English).
- Keep responses short, polite, and conversational like a real human chat support agent.

Customer message: "${messageText}"`,
            config: {
              temperature: 0.9,
            }
          });

          const replyText = aiResponse.text || aiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "Hello! Welcome to Kuicqli. How can I help you with your shipment today?";

          // 3. AI/Bot response ko bhi Database me Save karein
          const savedAiMessage = await Message.create({
            sessionId: sessionId,
            senderId: finalReceiverId,
            receiverId: finalSenderId,
            text: replyText,
            messageType: 'text'
          });

          const botReplyObj = {
            id: savedAiMessage._id,
            text: savedAiMessage.text,
            sender: 'ai',
            timestamp: savedAiMessage.createdAt
          };

          io.to(sessionId).emit('receive_message', botReplyObj);

        } catch (error) {
          console.error("Gemini AI Error Details:", error);

          const isHindi = messageText.toLowerCase().match(/hi|hello|hey|kaise|kya|bhai/);
          const fallbackReply = isHindi
            ? "Hello! Kuicqli support mein aapka swagat hai. Aaj hum aapki kya madad kar sakte hain?"
            : "Hello! Welcome to Kuicqli support. How can we help you with your shipment today?";

          const savedFallbackMessage = await Message.create({
            sessionId: sessionId,
            senderId: finalReceiverId,
            receiverId: finalSenderId,
            text: fallbackReply,
            messageType: 'text'
          });

          const botReplyObj = {
            id: savedFallbackMessage._id,
            text: savedFallbackMessage.text,
            sender: 'ai',
            timestamp: savedFallbackMessage.createdAt
          };

          io.to(sessionId).emit('receive_message', botReplyObj);
        }
      }
    } catch (dbError) {
      console.error("❌ Error saving message to database:", dbError);
    }
  });

  // Generate QR
  socket.on('generate-qr', () => {
    const sessionId = 'QR' + Date.now().toString().slice(-6) + Math.random().toString(36).substring(2, 5).toUpperCase();
    activeSessions.set(sessionId, { socketId: socket.id, status: 'pending' });
    console.log('📱 QR Code generated:', sessionId);
    socket.emit('qr-generated', { sessionId, qrData: sessionId });
  });

  // Scan QR
  socket.on('scan-qr', (data) => {
    const { sessionId } = data;
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.status = 'connected';
      activeSessions.set(sessionId, session);
      io.to(session.socketId).emit('qr-scanned', {
        sessionId,
        status: 'connected'
      });
      console.log('✅ QR Code scanned:', sessionId);
    } else {
      socket.emit('scan-error', { message: 'Invalid QR Code' });
    }
  });

  // Typing indicator
  socket.on('typing', (data) => {
    const { receiverId } = data;
    const receiverSocketId = activeSessions.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing-indicator', { senderId: socket.userId });
    }
  });

  // ============================================
  // CALL EVENTS (Integrated)
  // ============================================
  socket.on('call-user', ({ recipientId, callType, callerName, roomId }) => {
    const recipientSocketId = activeSessions.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('incoming-call', {
        callerId: socket.userId,
        callerName,
        callType,
        roomId
      });
      console.log(`📞 Call initiated from ${socket.userId} to ${recipientId}`);
    }
  });

  socket.on('end-call', ({ recipientId }) => {
    const recipientSocketId = activeSessions.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call-ended');
      console.log(`📴 Call ended for user: ${recipientId}`);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
    if (socket.userId) {
      activeSessions.delete(socket.userId);
      io.emit('user-online', { userId: socket.userId, isOnline: false });
    }
  });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.originalUrl);
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// ============================================
// ERROR HANDLER (SABSE LAST)
// ============================================
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth`);
});   