const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
    sendOTP,
    verifyOTP,
    getMe,
    logout,
    updateProfile,
    getContacts,
    getUser,
    updateOnlineStatus,
    profile,
    getProfile,
    getAllUsers,
    getShopkeeper,
    getAllCustomers,
    getAdmin
} = require("../controllers/authController");

const auth = require("../middleware/auth");

// ==========================================
// MULTER CONFIGURATION
// ==========================================

const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1E9);

        cb(
            null,
            uniqueSuffix + path.extname(file.originalname)
        );
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;

        const extName = allowedTypes.test(
            path.extname(file.originalname).toLowerCase()
        );

        const mimeType = allowedTypes.test(
            file.mimetype
        );

        if (extName && mimeType) {
            return cb(null, true);
        }

        cb(
            new Error(
                "Only JPG, JPEG, PNG and WebP images are allowed"
            )
        );
    }
});

// ==========================================
// AUTHENTICATION & OTP
// ==========================================

router.post("/send-otp", sendOTP);

router.post("/verify-otp", verifyOTP);

router.get("/me", auth, getMe);

router.post("/logout", auth, logout);

// ==========================================
// PROFILE
// ==========================================

router.post(
    "/profile",
    upload.single("profileImage"),
    updateProfile
);

router.post(
    "/profileUpdate",
    auth,
    upload.single("profileImage"),
    updateProfile
);

router.post("/save-profile", profile);

router.get("/profile/:id", getProfile);

// ==========================================
// CONTACTS
// ==========================================

router.get("/contacts", getContacts);

router.get("/contacts/:userId", getContacts);

// ==========================================
// USER / ADMIN
// ==========================================

router.get("/admin", getAdmin);

router.get("/shopkeeper", getShopkeeper);

router.get("/all-customers", getAllCustomers);

router.get("/all-users", getAllUsers);

// ==========================================
// STATUS
// ==========================================

router.put("/status", updateOnlineStatus);

// ==========================================
// GENERAL USER
// KEEP THIS LAST
// ==========================================

router.get("/:id", getUser);

module.exports = router;