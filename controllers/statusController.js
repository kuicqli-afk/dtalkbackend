// backend/controllers/statusController.js
const Status = require('../models/status');
const mongoose = require('mongoose');

// ==========================================
// CREATE A NEW STATUS
// ==========================================
const createStatus = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.body.userId;
    const { mediaUrl, caption, type, backgroundColor } = req.body;

    if (!userId || userId === "user-default-id" || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid or missing User ID. Please log in properly so a valid ID is loaded." 
      });
    }

    const newStatus = new Status({
      userId,
      mediaUrl: mediaUrl || "",
      caption: caption || "",
      type: type || "text",
      backgroundColor: backgroundColor || "#075e54"
    });

    await newStatus.save();
    
    // Populate using 'userId' matching your schema definition
    const populatedStatus = await Status.findById(newStatus._id)
      .populate('userId', 'name phone avatar profilePicture');

    return res.status(201).json({
      success: true,
      message: "Status uploaded successfully",
      status: populatedStatus
    });
  } catch (error) {
    console.error("❌ Error creating status:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Server error while uploading status" 
    });
  }
};

// ==========================================
// GET STATUS FEED (Last 24 Hours)
// ==========================================
const getStatusFeed = async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch statuses within 24 hours & populate 'userId'
    const statuses = await Status.find({
      createdAt: { $gte: twentyFourHoursAgo }
    })
    .populate('userId', 'name phone avatar profilePicture')
    .sort({ createdAt: -1 });

    const userStatusMap = {};

    statuses.forEach((status) => {
      if (!status.userId) return;
      
      // Handle case where populate returns an object or ID string
      const userObj = status.userId;
      const uId = userObj._id ? userObj._id.toString() : userObj.toString();

      if (!userStatusMap[uId]) {
        userStatusMap[uId] = {
          user: userObj,
          statuses: []
        };
      }
      userStatusMap[uId].statuses.push(status);
    });

    const feed = Object.values(userStatusMap);

    return res.status(200).json({
      success: true,
      feed
    });
  } catch (error) {
    console.error("❌ Error fetching status feed:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Server error while fetching statuses" 
    });
  }
};
const deleteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id || req.body.userId || req.query.userId;

    console.log("=====================================");
    console.log("DELETE STATUS REQUEST");
    console.log("Status ID to delete:", id);
    console.log("Request User ID:", userId);
    console.log("=====================================");

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid status ID format" });
    }

    const statusItem = await Status.findById(id);
    if (!statusItem) {
      return res.status(404).json({ success: false, message: "Status not found in database" });
    }

    console.log("Found Status Owner ID:", statusItem.userId.toString());

    // Verify ownership
    if (statusItem.userId.toString() !== userId?.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized: You can only delete your own status" });
    }

    await Status.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Status deleted successfully"
    });
  } catch (error) {
    console.error("❌ Error deleting status:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createStatus,
  getStatusFeed,
  getFeed: getStatusFeed,
  deleteStatus
};
