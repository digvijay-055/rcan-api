// File: rcan-api/src/controllers/authController.js
const User = require('../models/UserModel'); // Import the User model
const jwt = require('jsonwebtoken'); // To generate JWT tokens
const bcrypt = require('bcryptjs'); // To compare hashed passwords (already used in UserModel for hashing)

// --- Utility function to generate JWT ---
const generateToken = (userId, userRole) => {
    return jwt.sign(
        { id: userId, role: userRole }, // Payload: contains user ID and role
        process.env.JWT_SECRET,         // Secret key from .env
        { expiresIn: process.env.JWT_EXPIRES_IN } // Expiry time from .env
    );
};

// --- User Registration Controller ---
exports.registerUser = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        // 1. Validate input (basic validation)
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password.',
            });
        }

        // You can add more sophisticated validation here (e.g., password strength)

        // 2. Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use. Please login or use a different email.',
            });
        }

        // 3. Create new user (password will be hashed by the pre-save hook in UserModel)
        const newUser = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role: role || 'customer', // Default to 'customer' if role is not provided
        });

        // 4. Generate JWT token
        const token = generateToken(newUser._id, newUser.role);

        // 5. Send response (excluding password)
        // To exclude password even if 'select: false' wasn't on the model for some reason:
        const userResponse = { ...newUser._doc }; // _doc contains the plain object
        delete userResponse.password;

        res.status(201).json({ // 201 Created
            success: true,
            message: 'User registered successfully!',
            token,
            user: userResponse,
        });

    } catch (error) {
        console.error('Registration Error:', error);
        // Check for Mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid input data.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error during registration. Please try again later.',
            // error: error.message // Optionally send error message in dev
        });
        // next(error); // Or pass to a global error handler
    }
};

// --- User Login Controller ---
exports.loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // 1. Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password.',
            });
        }

        // 2. Find user by email (and explicitly select password as it's select: false in model)
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        // 3. If user not found or password doesn't match
        if (!user) {
            return res.status(401).json({ // 401 Unauthorized
                success: false,
                message: 'Invalid email or password.', // Generic message for security
            });
        }

        // Use the comparePassword method from the UserModel
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.', // Generic message
            });
        }

        // 4. Generate JWT token
        const token = generateToken(user._id, user.role);

        // 5. Send response (excluding password)
        const userResponse = { ...user._doc };
        delete userResponse.password;

        res.status(200).json({
            success: true,
            message: 'Logged in successfully!',
            token,
            user: userResponse,
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login. Please try again later.',
        });
        // next(error); // Or pass to a global error handler
    }
};

// --- Get Current Logged-In User Controller (Example of a protected route handler) ---
exports.getMe = async (req, res, next) => {
    try {
        // Assuming authMiddleware has added 'user' to req object
        // req.user is populated by the authMiddleware after verifying the token
        if (!req.user || !req.user.id) {
             return res.status(401).json({ success: false, message: 'Not authorized, user data not found in request.' });
        }

        const user = await User.findById(req.user.id).select('-password'); // Exclude password

        if (!user) {
            // This case might happen if the user was deleted after the token was issued
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error('GetMe Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user details.',
        });
        // next(error);
    }
};
