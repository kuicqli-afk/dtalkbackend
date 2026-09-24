const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);

  if (err.message === 'File type allowed nahi hai') {
    return res.status(400).json({ success: false, error: err.message });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'File 25MB se badi hai' });
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Kuch galat ho gaya server mein'
  });
};

module.exports = errorHandler;