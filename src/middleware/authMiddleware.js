// File: rcan-api/src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/UserModel'); // To fetch user details if needed

// Middleware to protect routes
exports.protect = async (req, res, next) => {
    let token;

    // 1. Check if token exists in headers
    // Tokens are usually sent in the Authorization header with the Bearer scheme
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header: "Bearer TOKEN_STRING" -> "TOKEN_STRING"
            token = req.headers.authorization.split(' ')[1];

            // 2. Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Attach user to the request object
            // We can fetch the user from the database to ensure they still exist
            // and to have up-to-date user info on req.user.
            // Exclude password when fetching.
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user) {
                // This case handles if a user was deleted after a token was issued
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, user belonging to this token no longer exists.',
                });
            }

            next(); // Proceed to the next middleware or route handler

        } catch (error) {
            console.error('Token verification error:', error.message);
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, token failed verification (invalid token).',
                });
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Not authorized, token has expired.',
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token error.',
            });
        }
    }

    if (!token) {
        return res.status(401).json({ // 401 Unauthorized
            success: false,
            message: 'Not authorized, no token provided.',
        });
    }
};

// Optional: Middleware to authorize based on roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        // req.user should be populated by the 'protect' middleware
        if (!req.user || !req.user.role) {
             return res.status(403).json({ // 403 Forbidden
                success: false,
                message: 'User role not found, authorization check failed.',
            });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ // 403 Forbidden
                success: false,
                message: `User role '${req.user.role}' is not authorized to access this route.`,
            });
        }
        next(); // Role is authorized
    };
};
