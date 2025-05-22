// File: rcan-api/src/controllers/authController.js
const User = require('../models/UserModel');
const jwt = require('jsonwebtoken');
// bcrypt is used in UserModel's pre-save hook and comparePassword method

// --- Utility function to generate JWT ---
const generateToken = (userId, userRole) => {
    return jwt.sign(
        { id: userId, role: userRole },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );
};

// --- User Registration Controller ---
exports.registerUser = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password.',
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use. Please login or use a different email.',
            });
        }

        const newUser = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role: role || 'customer',
        });

        const token = generateToken(newUser._id, newUser.role);
        const userResponse = { ...newUser._doc };
        delete userResponse.password;

        res.status(201).json({
            success: true,
            message: 'User registered successfully!',
            token,
            user: userResponse,
        });

    } catch (error) {
        console.error('Registration Error:', error);
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
        });
    }
};

// --- User Login Controller ---
exports.loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password.',
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        const token = generateToken(user._id, user.role);
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
    }
};

// --- Get Current Logged-In User Controller ---
exports.getMe = async (req, res, next) => {
    try {
        // req.user is populated by the authMiddleware after verifying the token
        if (!req.user || !req.user.id) {
             return res.status(401).json({ success: false, message: 'Not authorized, user data not found in request.' });
        }
        // User object from req.user is already selected without password by protect middleware
        res.status(200).json({
            success: true,
            user: req.user, // Send the user object attached by the protect middleware
        });
    } catch (error) {
        console.error('GetMe Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user details.',
        });
    }
};

// --- Update User Details (e.g., name) ---
// @access  Private
exports.updateUserDetails = async (req, res, next) => {
    try {
        const userId = req.user.id; // From protect middleware
        const { name /*, other fields like email if you allow changing them */ } = req.body;

        // Fields to update
        const fieldsToUpdate = {};
        if (name) fieldsToUpdate.name = name;
        // Add other fields here if needed, e.g.:
        // if (req.body.email) fieldsToUpdate.email = req.body.email; // Be cautious with email updates due to uniqueness

        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No details provided for update.',
            });
        }

        // Find user and update
        // { new: true } returns the updated document
        // { runValidators: true } ensures schema validations are run on update
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            fieldsToUpdate,
            { new: true, runValidators: true }
        ).select('-password'); // Exclude password from the returned user object

        if (!updatedUser) {
            // This case should be rare if protect middleware worked correctly
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        res.status(200).json({
            success: true,
            message: 'User details updated successfully!',
            user: updatedUser,
        });

    } catch (error) {
        console.error('Update User Details Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid input data for update.',
            });
        }
        // Handle other potential errors, e.g., if email update causes unique constraint violation
        if (error.code === 11000 && error.keyValue && error.keyValue.email) { // MongoDB duplicate key error for email
            return res.status(400).json({
                success: false,
                message: 'Email address is already in use by another account.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while updating user details. Please try again later.',
        });
    }
};
