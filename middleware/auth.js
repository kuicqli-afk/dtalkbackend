const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    console.log("========== AUTH CHECK ==========");
    console.log("Authorization exists:", !!req.headers.authorization);
    console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required.",
      });
    }

    const parts = authHeader.split(" ");

    if (
      parts.length !== 2 ||
      parts[0] !== "Bearer" ||
      !parts[1]
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format.",
      });
    }

    const token = parts[1];

    console.log("Token received:", !!token);
    console.log("Token length:", token.length);

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    console.log("JWT VERIFIED SUCCESSFULLY");
    console.log("JWT payload:", decoded);

    req.user = decoded;

    next();

  } catch (error) {
    console.error("========== JWT ERROR ==========");
    console.error("Name:", error.name);
    console.error("Message:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

module.exports = auth;