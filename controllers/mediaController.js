// backend/routes/chatRoute.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { handleChat, getConversation } = require('../controllers/chatController');

// ============================================
// MULTER SETUP (File Upload)
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ============================================
// ROUTES
// ============================================
router.post('/', handleChat);
router.get('/history/:sessionId', getConversation);

// ✅ MEDIA UPLOAD ROUTE
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    const { sessionId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        path: `/uploads/${file.filename}`
      }
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;