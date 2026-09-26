const express = require('express');
const router = express.Router();

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const {
  sendMessage,
  getMessages,
  getConversations,
  adminReply,
  clearChat,
  deleteSession,
  addReaction,
  deleteMessage   // 👈 naya import
} = require('../controllers/messageController');

// ============================================
// CLOUDINARY STORAGE (For Images, Audio, PDF)
// ============================================
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "kuicqli_uploads",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "mp4", "mp3", "wav", "pdf"],
    resource_type: "auto",
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit 
});

// ============================================
// CHAT ENDPOINTS
// ============================================
router.get('/conversations', getConversations);
router.post('/send', sendMessage);
router.post('/', sendMessage);
router.post('/admin-reply', adminReply);
router.get('/history/:sessionId', getMessages);
router.delete('/clear/:sessionId', clearChat);
router.delete('/session/:sessionId', deleteSession);
router.delete('/message/:id', deleteMessage);
// ============================================
// MEDIA UPLOAD ENDPOINT
// ============================================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }
    const fileUrl = req.file.path || req.file.secure_url;
    return res.status(200).json({
      success: true,
      file: {
        url: fileUrl,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;