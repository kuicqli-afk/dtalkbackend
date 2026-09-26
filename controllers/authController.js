const axios = require("axios");
const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/message');
const jwt = require("jsonwebtoken");
const shyamFoodApi = require('../services/shyamFoodApi');
const MUZZTECH_API_KEY = process.env.MUZZTECH_API_KEY || "9344cb98b24718f608f5241beaea8a81";
const sessionStore = {};

const formatPhone = (phone) => {
    if (!phone) return "";
    const cleaned = String(phone).replace(/\D/g, "");
    return cleaned.slice(-10);
};

// ==========================================
// AUTHENTICATION & OTP CONTROLLERS
// ==========================================

exports.sendOTP = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const cleanPhone = formatPhone(phone);

        if (!cleanPhone || cleanPhone.length !== 10) {
            return res.status(400).json({ success: false, error: "Please enter a valid 10-digit phone number" });
        }

        let shyamUserName = `User_${cleanPhone.slice(-4)}`;
        let shyamRole = "customer";

        try {
            const shyamCheck = await shyamFoodApi.get("/api/user/all-users");
            const usersList = shyamCheck.data.users || shyamCheck.data.contacts || shyamCheck.data || [];

            const validUser = usersList.find(u => {
                const userPhone = String(u.phone || u.mobile || "").replace(/\D/g, "").slice(-10);
                return userPhone === cleanPhone;
            });

            if (!validUser) {
                return res.status(403).json({
                    success: false,
                    error: "Access Denied: This phone number is not registered with us"
                });
            }

            if (validUser.name || validUser.fullName || validUser.username || validUser.ownerName || validUser.shopName) {
                shyamUserName = validUser.name || validUser.fullName || validUser.username || validUser.ownerName || validUser.shopName;
            }

            if (validUser.role) {
                shyamRole = validUser.role;
            }
        } catch (shyamError) {
            console.error("ShyamFood Verification Error:", shyamError.response?.data || shyamError.message);
            return res.status(403).json({
                success: false,
                error: "Unauthorized: Failed to verify phone number with ShyamFood database."
            });
        }

        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            user = await User.create({
                name: (name && name.trim() !== "") ? name.trim() : shyamUserName,
                phone: cleanPhone,
                role: shyamRole
            });
        } else {
            let needsSave = false;

            if (shyamRole && user.role !== shyamRole) {
                user.role = shyamRole;
                needsSave = true;
            }

            if (user.name.startsWith("User_") && shyamUserName && !shyamUserName.startsWith("User_")) {
                user.name = shyamUserName;
                needsSave = true;
            } else if (name && name.trim() !== "" && user.name.startsWith("User_")) {
                user.name = name.trim();
                needsSave = true;
            }

            if (needsSave) {
                await user.save();
            }
        }

        const formData = new URLSearchParams();
        formData.append("api_key", MUZZTECH_API_KEY);
        formData.append("phone_number", `91${cleanPhone}`);
        formData.append("otp_template_name", "OTP");

        const response = await axios.post("https://connect.muzztech.com/api/V1", formData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        if (response.data.Status === "Success" && response.data.Details) {
            sessionStore[cleanPhone] = response.data.Details;
            return res.status(200).json({
                success: true,
                message: "OTP sent successfully",
                userId: user._id,
            });
        }

        return res.status(400).json({ success: false, error: response.data.Message || "Failed to send OTP via Muzztech" });
    } catch (error) {
        console.error("Send OTP Error:", error.message);
        return res.status(500).json({ success: false, error: "Error sending OTP" });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        const cleanPhone = formatPhone(phone);
        const sessionId = sessionStore[cleanPhone];

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "OTP session expired or not found. Please resend OTP." });
        }

        const response = await axios.get("https://connect.muzztech.com/api/V1", {
            params: {
                api_key: MUZZTECH_API_KEY,
                otp_session: sessionId,
                otp_entered_by_user: String(otp).trim(),
            },
        });

        if (response.data.Status !== "Success") {
            return res.status(400).json({ success: false, error: response.data.Message || "Invalid OTP" });
        }

        delete sessionStore[cleanPhone];

        let user = await User.findOne({ phone: cleanPhone });
        if (!user) {
            user = await User.create({
                phone: cleanPhone,
                name: "",
                username: "",
                role: "customer"
            });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ success: false, error: "JWT_SECRET is not configured" });
        }

        const token = jwt.sign(
            {
                id: user._id.toString(),
                userId: user._id.toString(),
                phone: user.phone,
                role: user.role || "customer"
            },
            secret,
            { expiresIn: "7d" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user._id,
                _id: user._id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                avatar: user.avatar,
                bio: user.bio,
                role: user.role || "customer"
            }
        });
    } catch (error) {
        console.error("Verify OTP Error:", error.message);
        return res.status(500).json({ success: false, error: "Error verifying OTP" });
    }
};

exports.getMe = async (req, res) => {
    try {
        const userId = req.userId || req.user?.id || req.user?._id;
        let user = await User.findById(userId).select('-otp');
        if (!user) {
            // Auto-recovery if user missing
            user = await User.create({ phone: "9999999999", name: "Recovered User", role: "customer" });
        }
        res.json({
            success: true,
            profile: {
                id: user._id,
                _id: user._id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                bio: user.bio,
                profileImage: user.avatar,
                avatar: user.avatar,
                role: user.role || "customer"
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.logout = async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            await User.findByIdAndUpdate(userId, { isOnline: false });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ==========================================
// USER & CONTACT MANAGEMENT CONTROLLERS
// ==========================================

exports.getContacts = async (req, res) => {
    try {
        const userId = req.query.userId || req.params.userId || req.userId || req.user?.id;

        if (!userId || userId === 'undefined' || userId === 'null') {
            return res.status(400).json({ success: false, error: 'User ID is required' });
        }

        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, error: 'Current user not found' });
        }

        let query = {};
        if (currentUser.role === 'shopkeeper') {
            query = { role: 'customer', _id: { $ne: userId } };
        } else if (currentUser.role === 'customer') {
            query = { role: 'shopkeeper', _id: { $ne: userId } };
        } else {
            query = { _id: { $ne: userId } };
        }

        let users = await User.find(query)
            .select('name username phone avatar isOnline lastSeen status bio role')
            .sort({ isOnline: -1, name: 1 });

        const contactsWithLastMsg = await Promise.all(
            users.map(async (user) => {
                let conversation = null;

                if (user._id.toString() !== userId) {
                    const sortedIds = [String(userId), String(user._id)].sort();
                    const generatedSessionId = `session-${sortedIds[0]}-${sortedIds[1]}`;

                    conversation = await Conversation.findOne({
                        $or: [
                            { sessionId: generatedSessionId },
                            { participants: { $all: [userId, user._id] } }
                        ]
                    });
                }

                let displayName = 'Unknown User';
                if (user.name && user.name.trim() && !user.name.startsWith('+91')) {
                    displayName = user.name.trim();
                } else if (user.phone) {
                    displayName = `+91 ${user.phone}`;
                }

                let lastMsgText = user.status || user.bio || 'Hey there! I am using Kuickli Chat';
                let lastMsgTime = null;

                if (conversation) {
                    if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
                        const latestMessage = conversation.messages[conversation.messages.length - 1];
                        lastMsgText = latestMessage.text || lastMsgText;
                        lastMsgTime = latestMessage.timestamp || null;
                    } else if (conversation.lastMessage) {
                        lastMsgText = conversation.lastMessage.text || lastMsgText;
                        lastMsgTime = conversation.lastMessage.timestamp || null;
                    }
                }

                return {
                    id: user._id.toString(),
                    _id: user._id.toString(),
                    name: displayName,
                    phone: user.phone || '',
                    avatar: user.avatar || '',
                    isOnline: user.isOnline || false,
                    lastSeen: user.lastSeen || null,
                    status: user.status || user.bio || 'Hey there! I am using Kuickli Chat',
                    lastMessage: lastMsgText,
                    lastMessageTime: lastMsgTime,
                    unreadCount: conversation?.unreadCount || 0,
                    role: user.role
                };
            })
        );

        res.json({
            success: true,
            contacts: contactsWithLastMsg
        });
    } catch (error) {
        console.error('Error fetching role-based contacts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getUser = async (req, res) => {
    try {
        const requestedId = req.params.id;

        if (requestedId === 'admin') {
            const user = await User.findOne({ role: 'shopkeeper' }).select(
                'name username phone avatar isOnline lastSeen status bio role'
            );
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }
            return res.json({
                success: true,
                user: {
                    id: user._id.toString(),
                    _id: user._id.toString(),
                    name: user.name || 'Shopkeeper',
                    username: user.username || '',
                    phone: user.phone || '',
                    avatar: user.avatar || '',
                    isOnline: user.isOnline || false,
                    lastSeen: user.lastSeen || null,
                    status: user.status || user.bio || 'Available',
                    bio: user.bio || '',
                    role: user.role || 'shopkeeper'
                }
            });
        }

        if (!mongoose.Types.ObjectId.isValid(requestedId)) {
            return res.status(400).json({ success: false, error: 'Invalid User ID format' });
        }

        const user = await User.findById(requestedId).select(
            'name username phone avatar isOnline lastSeen status bio role'
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user._id.toString(),
                _id: user._id.toString(),
                name: user.name || 'Unknown User',
                username: user.username || '',
                phone: user.phone || '',
                avatar: user.avatar || '',
                isOnline: user.isOnline || false,
                lastSeen: user.lastSeen || null,
                status: user.status || user.bio || 'Available',
                bio: user.bio || '',
                role: user.role || 'customer'
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateOnlineStatus = async (req, res) => {
    try {
        const { userId, isOnline } = req.body;
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            await User.findByIdAndUpdate(userId, { isOnline, lastSeen: new Date() });
        }
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.profile = async (req, res) => {
    try {
        const { userId, name, bio, avatar, phone } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, error: 'Valid User ID is required' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                ...(name !== undefined && { name }),
                ...(bio !== undefined && { bio, status: bio }),
                ...(avatar !== undefined && { avatar }),
                ...(phone !== undefined && { phone })
            },
            { returnDocument: 'after' }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            profile: updatedUser
        });
    } catch (error) {
        console.error('Save profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.userId || req.user?.id || req.body.userId;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, error: "Valid User ID is missing" });
        }

        const { name, username, bio } = req.body;
        const updateData = {};
        if (name !== undefined && name.trim() !== '') updateData.name = name.trim();
        if (username !== undefined) updateData.username = username.trim();
        if (bio !== undefined) {
            updateData.bio = bio.trim();
            updateData.status = bio.trim();
        }

        if (req.file) {
            updateData.avatar = `/uploads/${req.file.filename}`;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        ).select('-otp');

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found in database' });
        }

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                id: user._id,
                _id: user._id,
                name: user.name,
                username: user.username,
                phone: user.phone,
                bio: user.bio,
                profileImage: user.avatar,
                avatar: user.avatar,
                role: user.role || "customer"
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const requestedId = req.params.id;

        if (requestedId === 'admin') {
            const profile = await User.findOne({ role: 'shopkeeper' });
            if (!profile) {
                return res.status(404).json({ success: false, error: "Profile not found" });
            }
            return res.status(200).json({ success: true, profile });
        }

        if (!mongoose.Types.ObjectId.isValid(requestedId)) {
            return res.status(400).json({ success: false, error: "Invalid User ID format" });
        }

        const profile = await User.findById(requestedId);
        if (!profile) {
            return res.status(404).json({ success: false, error: "Profile not found" });
        }
        return res.status(200).json({ success: true, profile });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const { userId } = req.query;
        const response = await shyamFoodApi.get("/api/user/all-users", {
            params: userId ? { userId } : {},
        });

        return res.status(200).json({
            success: true,
            users: response.data.users || response.data.contacts || [],
        });
    } catch (error) {
        return res.status(error.response?.status || 500).json({
            success: false,
            message: "Failed to fetch users from ShyamFood backend",
            error: error.response?.data || error.message,
        });
    }
};

exports.getShopkeeper = async (req, res) => {
    try {
        // Yahan hum strictly database mein se us user ko dhoond rahe hain jiska role admin, shopkeeper ya store hai
        const shopkeeper = await User.findOne({
            role: { $regex: /^(admin|shopkeeper|store)$/i }
        }).select('-password -otp');

        if (!shopkeeper) {
            return res.status(404).json({
                success: false,
                message: "Database mein koi shopkeeper ya admin registered nahi hai."
            });
        }

        // Yeh real shopkeeper/admin ka data return karega, na ki logged-in customer ka
        return res.status(200).json({
            success: true,
            shopkeeper: {
                _id: shopkeeper._id,
                name: shopkeeper.name || "Shopkeeper",
                phone: shopkeeper.phone || "",
                avatar: shopkeeper.avatar || "",
                bio: shopkeeper.bio || "Online Support"
            }
        });
    } catch (error) {
        console.error("Get Shopkeeper Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

exports.getAllCustomers = async (req, res) => {
    try {
        const customers = await User.find({ role: { $regex: /^customer$/i } })
            .select("_id id name username phone avatar bio status isOnline role")
            .sort({ isOnline: -1, name: 1 });

        const formattedCustomers = customers.map((user) => ({
            id: user._id.toString(),
            _id: user._id.toString(),
            name: user.name ? user.name.trim() : (user.phone ? `+91 ${user.phone}` : "Unknown User"),
            username: user.username || "",
            phone: user.phone || "",
            avatar: user.avatar || "",
            isOnline: user.isOnline || false,
            status: user.status || user.bio || 'Hey there!',
            bio: user.bio || "",
            role: user.role
        }));

        return res.status(200).json({
            success: true,
            users: formattedCustomers,
            contacts: formattedCustomers
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch customers", error: error.message });
    }
};

// ==========================================
// BULLETPROOF GETADMIN CONTROLLER
// ==========================================
exports.getAdmin = async (req, res) => {
    try {
        let userId = req.userId || req.user?.id || req.user?._id;
        let decodedTokenData = null;

        if (req.headers.authorization) {
            try {
                const parts = req.headers.authorization.split(' ');
                const token = parts.length === 2 ? parts[1] : parts[0];
                const secret = process.env.JWT_SECRET;
                if (token && secret) {
                    decodedTokenData = jwt.verify(token, secret);
                    userId = decodedTokenData.id || decodedTokenData.userId;
                }
            } catch (jwtErr) {
                console.error("JWT Decode Error:", jwtErr.message);
            }
        }

        if (!userId || userId === 'admin') {
            const shopkeeper = await User.findOne({ role: { $regex: /^shopkeeper$/i } }).select('-otp');
            if (shopkeeper) {
                return res.status(200).json({
                    success: true,
                    user: shopkeeper,
                    shopkeeper: shopkeeper
                });
            }
        }

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            const shopkeeper = await User.findOne({ role: { $regex: /^shopkeeper$/i } }).select('-otp');
            return res.status(200).json({
                success: true,
                user: shopkeeper || null,
                shopkeeper: shopkeeper || null
            });
        }

        let currentUser = await User.findById(userId).select('-otp');

        if (!currentUser) {
            currentUser = await User.create({
                phone: decodedTokenData?.phone || "9999999999",
                name: decodedTokenData?.name || "Recovered User",
                role: decodedTokenData?.role || "customer"
            });
        }

        return res.status(200).json({
            success: true,
            user: currentUser,
            shopkeeper: currentUser // Frontend compatibility ke liye dono bhej rahe hain
        });
    } catch (error) {
        console.error("Get Admin Error:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};// ==========================================
// FULLY DYNAMIC STORE INFO CONTROLLER
// ==========================================
exports.getStoreInfo = async (req, res) => {
    try {
        const response = await shyamFoodApi.get("/api/admin/auth/store-info");

        return res.status(200).json({
            success: true,
            store: response.data?.store || response.data?.user || response.data,
        });

    } catch (error) {
        console.error(
            "Store Info Error:",
            error.response?.data || error.message
        );

        return res.status(error.response?.status || 500).json({
            success: false,
            message: "Failed to fetch store information from ShyamFood backend",
            error: error.response?.data || error.message,
        });
    }
};                  
