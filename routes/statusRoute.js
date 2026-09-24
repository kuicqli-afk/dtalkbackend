// backend/routes/statusRoutes.js
const express = require('express');
const router = express.Router();
const { createStatus, getStatusFeed, deleteStatus } = require('../controllers/statusController');

router.post('/', createStatus);
router.get('/feed', getStatusFeed);
router.delete('/:id', deleteStatus); 

module.exports = router;