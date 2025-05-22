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
        if (!req.user || !req.user.id) {
             return res.status(401).json({ success: false, message: 'Not authorized, user data not found in request.' });
        }
        res.status(200).json({
            success: true,
            user: req.user,
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
exports.updateUserDetails = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        const fieldsToUpdate = {};
        if (name) fieldsToUpdate.name = name;

        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No details provided for update.',
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            fieldsToUpdate,
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
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
        if (error.code === 11000 && error.keyValue && error.keyValue.email) {
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

// --- Update User Password ---
// @access  Private
exports.updateUserPassword = async (req, res, next) => {
    try {
        const userId = req.user.id; // From protect middleware
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        // 1. Validate input
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current password, new password, and confirm new password.',
            });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password and confirm new password do not match.',
            });
        }

        // 2. Fetch user from DB (need to select password as it's not selected by default)
        const user = await User.findById(userId).select('+password');

        if (!user) {
            // Should not happen if protect middleware is working
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // 3. Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ // 401 Unauthorized
                success: false,
                message: 'Incorrect current password.',
            });
        }
        
        // 4. Check new password length (already handled by model validation, but good for early feedback)
        if (newPassword.length < 8) {
             return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long.',
            });
        }


        // 5. Set the new password
        // The pre-save hook in UserModel will automatically hash it before saving
        user.password = newPassword;
        await user.save(); // This will trigger the pre-save hook for hashing

        // 6. Optionally, generate a new token (good practice as password change is sensitive)
        // const token = generateToken(user._id, user.role);

        res.status(200).json({
            success: true,
            message: 'Password updated successfully.',
            // token: token, // Send new token if generated
        });

    } catch (error) {
        console.error('Update User Password Error:', error);
        if (error.name === 'ValidationError') { // For new password not meeting schema criteria
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid new password data.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while updating password. Please try again later.',
        });
    }
};
