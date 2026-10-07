import jwt from "jsonwebtoken";

export const isAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

    const token = req.cookies?.token || bearerToken || req.headers.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
    }

    const verifyToken = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = verifyToken.userId;
    next();
  } catch (error) {
    console.warn("Auth Middleware Error:", error.message || error);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

    const token = req.cookies?.token || bearerToken || req.headers.token;

    if (token) {
      const verifyToken = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = verifyToken.userId;
    }
  } catch {
    // Non-blocking: continue as guest
  }
  next();
};

export default isAuth;
