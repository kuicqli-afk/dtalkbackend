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
const Message = require('./models/message');

const statusRoute = require('./routes/statusRoute');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoute = require('./routes/authRoute');
const messageRoute = require('./routes/messageRoute');
const mediaRoute = require('./routes/mediaRoute');
const broadcastRoute = require('./routes/broadcastRoute');
const storeRoute = require('./routes/storeRoute');

const app = express();
const server = http.createServer(app);

// ============================================
// INITIALIZE GEMINI AI
// ============================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ============================================
// ALLOWED ORIGINS
// ============================================

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5000',

  'https://backend.shyamnamkeenandbakers.online',
  'https://dtalkbusiness.designerbirds.com',

  process.env.FRONTEND_URL
]
  .filter(Boolean)
  .map(origin => origin.replace(/\/$/, ''));

console.log('✅ Allowed CORS Origins:');
console.log(allowedOrigins);

// ============================================
// SOCKET.IO
// ============================================

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);

// ============================================
// CORS
// ============================================

app.use(
  cors({
    origin: (origin, callback) => {

      // Allow requests without Origin
      // Example: Postman, curl, server-to-server
      if (!origin) {
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/$/, '');

      if (allowedOrigins.includes(cleanOrigin)) {
        return callback(null, true);
      }

      console.log('❌ CORS blocked:', origin);

      return callback(
        new Error(`CORS blocked for origin: ${origin}`)
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ],

    credentials: true
  })
);

// ============================================
// HANDLE PREFLIGHT REQUESTS
// ============================================

app.options(
  '*',
  cors({
    origin: (origin, callback) => {

      if (!origin) {
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/$/, '');

      if (allowedOrigins.includes(cleanOrigin)) {
        return callback(null, true);
      }

      console.log('❌ CORS preflight blocked:', origin);

      return callback(
        new Error(`CORS blocked for origin: ${origin}`)
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ],

    credentials: true
  })
);

// ============================================
// BODY PARSER
// ============================================

app.use(express.json());

// ============================================
// STATUS ROUTE
// ============================================

app.use('/api/status', statusRoute);

// ============================================
// CREATE UPLOADS FOLDER
// ============================================

const uploadsPath = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, {
    recursive: true
  });

  console.log('📁 Uploads folder created');
}

// ============================================
// STATIC FILES
// ============================================

app.use(
  '/uploads',
  express.static(uploadsPath)
);

// ============================================
// DATABASE
// ============================================

connectDB();

// ============================================
// ROUTES
// ============================================

// Authentication
app.use('/api/auth', authRoute);

// Admin / Store authentication
app.use('/api/admin/auth', storeRoute);

// Messages
app.use('/api/messages', messageRoute);

// Media
app.use('/api/media', mediaRoute);

// Broadcast
app.use('/api/broadcast', broadcastRoute);

// Users
app.use('/api/users', require('./routes/authRoute'));

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: '🚀 Dtalk Chat API',
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

// ============================================
// ROOT
// ============================================

app.get('/', (req, res) => {
  res.send('🚀 Dtalk Chat API is running...');
});

// ============================================
// SOCKET.IO EVENTS
// ============================================

const activeSessions = new Map();

io.on('connection', (socket) => {

  console.log('🟢 Client connected:', socket.id);

  // ============================================
  // REGISTER USER
  // ============================================

  socket.on('register-user', async (userId) => {

    socket.userId = userId;

    activeSessions.set(
      userId,
      socket.id
    );

    console.log(
      `👤 User ${userId} registered & online`
    );

    io.emit('user-online', {
      userId,
      isOnline: true
    });

    try {

      // Database status update logic if needed

    } catch (error) {

      console.error(
        'Error updating offline status on register:',
        error
      );

    }
  });

  // ============================================
  // JOIN CHAT ROOM
  // ============================================

  socket.on('join_room', (sessionId) => {

    socket.join(sessionId);

    console.log(
      `💬 Socket ${socket.id} joined room: ${sessionId}`
    );

  });

  // ============================================
  // RECENT MESSAGE TRACKING
  // ============================================

  const recentMessages = new Set();

  // ============================================
  // SEND MESSAGE
  // ============================================

  socket.on('send_message', async (data) => {

    const {
      sessionId,
      text,
      message,
      sender = 'user',
      senderId,
      recipientId,
      receiverId
    } = data;

    const messageText = text || message;

    if (!sessionId || !messageText) {
      return;
    }

    // ============================================
    // DUPLICATE MESSAGE CHECK
    // ============================================

    const msgKey =
      `${sessionId}-${senderId || socket.userId}-${messageText}`;

    if (recentMessages.has(msgKey)) {
      return;
    }

    recentMessages.add(msgKey);

    setTimeout(() => {
      recentMessages.delete(msgKey);
    }, 1500);

    // ============================================
    // FINAL USER IDs
    // ============================================

    const finalSenderId =
      senderId || socket.userId;

    const finalReceiverId =
      receiverId || recipientId;

    try {

      // ============================================
      // SAVE USER MESSAGE
      // ============================================

      const savedUserMessage =
        await Message.create({
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

      io.to(sessionId).emit(
        'receive_message',
        userMsgObj
      );

      console.log(
        `📨 Message saved & sent in room ${sessionId}:`,
        messageText
      );

      // ============================================
      // GEMINI AI RESPONSE
      // ============================================

      if (sender === 'user') {

        const cleanText =
          messageText.replace(
            /[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu,
            ''
          );

        if (cleanText.length === 0) {
          return;
        }

        try {

          const aiResponse =
            await ai.models.generateContent({

              model: 'gemini-3.6-flash',

              contents: `
You are Dtalk, a friendly business chat assistant.

- If the user greets you like hi, hello, salam, hey, kaise ho, greet them warmly.
- Help customers with their business communication and support queries.
- Match the user's language.
- If they use Hindi/Hinglish, reply in Hindi/Hinglish.
- If they use English, reply in English.
- Keep responses short, polite and conversational.
- Respond like a real human business support agent.

Customer message:
"${messageText}"
              `,

              config: {
                temperature: 0.9
              }

            });

          const replyText =
            aiResponse.text ||
            aiResponse.candidates?.[0]?.content?.parts?.[0]?.text ||
            'Hello! Welcome to Dtalk. How can I help you today?';

          // ============================================
          // SAVE AI MESSAGE
          // ============================================

          const savedAiMessage =
            await Message.create({

              sessionId: sessionId,

              senderId:
                finalReceiverId,

              receiverId:
                finalSenderId,

              text: replyText,

              messageType: 'text'

            });

          const botReplyObj = {

            id: savedAiMessage._id,

            text: savedAiMessage.text,

            sender: 'ai',

            timestamp:
              savedAiMessage.createdAt

          };

          io.to(sessionId).emit(
            'receive_message',
            botReplyObj
          );

        } catch (error) {

          console.error(
            'Gemini AI Error Details:',
            error
          );

          // ============================================
          // FALLBACK RESPONSE
          // ============================================

          const isHindi =
            messageText
              .toLowerCase()
              .match(
                /hi|hello|hey|kaise|kya|bhai|salam/
              );

          const fallbackReply =
            isHindi
              ? 'Hello! Dtalk support mein aapka swagat hai. Aaj hum aapki kya madad kar sakte hain?'
              : 'Hello! Welcome to Dtalk support. How can we help you today?';

          const savedFallbackMessage =
            await Message.create({

              sessionId: sessionId,

              senderId:
                finalReceiverId,

              receiverId:
                finalSenderId,

              text: fallbackReply,

              messageType: 'text'

            });

          const botReplyObj = {

            id: savedFallbackMessage._id,

            text: savedFallbackMessage.text,

            sender: 'ai',

            timestamp:
              savedFallbackMessage.createdAt

          };

          io.to(sessionId).emit(
            'receive_message',
            botReplyObj
          );

        }
      }

    } catch (dbError) {

      console.error(
        '❌ Error saving message to database:',
        dbError
      );

    }

  });

  // ============================================
  // GENERATE QR
  // ============================================

  socket.on('generate-qr', () => {

    const sessionId =
      'QR' +
      Date.now()
        .toString()
        .slice(-6) +
      Math.random()
        .toString(36)
        .substring(2, 5)
        .toUpperCase();

    activeSessions.set(
      sessionId,
      {
        socketId: socket.id,
        status: 'pending'
      }
    );

    console.log(
      '📱 QR Code generated:',
      sessionId
    );

    socket.emit(
      'qr-generated',
      {
        sessionId,
        qrData: sessionId
      }
    );

  });

  // ============================================
  // SCAN QR
  // ============================================

  socket.on('scan-qr', (data) => {

    const {
      sessionId
    } = data;

    if (activeSessions.has(sessionId)) {

      const session =
        activeSessions.get(sessionId);

      session.status =
        'connected';

      activeSessions.set(
        sessionId,
        session
      );

      io.to(session.socketId).emit(
        'qr-scanned',
        {
          sessionId,
          status: 'connected'
        }
      );

      console.log(
        '✅ QR Code scanned:',
        sessionId
      );

    } else {

      socket.emit(
        'scan-error',
        {
          message: 'Invalid QR Code'
        }
      );

    }

  });

  // ============================================
  // TYPING INDICATOR
  // ============================================

  socket.on('typing', (data) => {

    const {
      receiverId
    } = data;

    const receiverSocketId =
      activeSessions.get(receiverId);

    if (receiverSocketId) {

      io.to(receiverSocketId).emit(
        'typing-indicator',
        {
          senderId: socket.userId
        }
      );

    }

  });

  // ============================================
  // CALL USER
  // ============================================

  socket.on(
    'call-user',
    ({
      recipientId,
      callType,
      callerName,
      roomId
    }) => {

      const recipientSocketId =
        activeSessions.get(recipientId);

      if (recipientSocketId) {

        io.to(recipientSocketId).emit(
          'incoming-call',
          {
            callerId: socket.userId,
            callerName,
            callType,
            roomId
          }
        );

        console.log(
          `📞 Call initiated from ${socket.userId} to ${recipientId}`
        );

      }

    }
  );

  // ============================================
  // END CALL
  // ============================================

  socket.on(
    'end-call',
    ({ recipientId }) => {

      const recipientSocketId =
        activeSessions.get(recipientId);

      if (recipientSocketId) {

        io.to(recipientSocketId).emit(
          'call-ended'
        );

        console.log(
          `📴 Call ended for user: ${recipientId}`
        );

      }

    }
  );

  // ============================================
  // DISCONNECT
  // ============================================

  socket.on('disconnect', () => {

    console.log(
      '🔴 Client disconnected:',
      socket.id
    );

    if (socket.userId) {

      activeSessions.delete(
        socket.userId
      );

      io.emit(
        'user-online',
        {
          userId: socket.userId,
          isOnline: false
        }
      );

    }

  });

});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {

  console.log(
    '❌ 404 - Route not found:',
    req.method,
    req.originalUrl
  );

  res.status(404).json({

    success: false,

    error: 'Route not found',

    path: req.originalUrl,

    method: req.method

  });

});

// ============================================
// ERROR HANDLER
// ============================================

app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

const PORT =
  process.env.PORT || 5000;

server.listen(PORT, () => {

  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );

  console.log(
    `🔐 Auth: http://localhost:${PORT}/api/auth`
  );

  console.log(
    `🌐 Frontend allowed: https://dtalkbusiness.designerbirds.com`
  );

});
