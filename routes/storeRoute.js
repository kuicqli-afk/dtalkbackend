const express = require("express");

const router = express.Router();

const { getStoreInfo } = require("../controllers/authController");

router.get("/store-info", getStoreInfo);

module.exports = router;