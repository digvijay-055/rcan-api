// File: rcan-api/src/controllers/authController.js
const User = require('../models/UserModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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
            return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
        }
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already in use. Please login or use a different email.' });
        }
        const newUser = await User.create({ name, email: email.toLowerCase(), password, role: role || 'customer' });
        const token = generateToken(newUser._id, newUser.role);
        const userResponse = { ...newUser._doc };
        delete userResponse.password;
        res.status(201).json({ success: true, message: 'User registered successfully!', token, user: userResponse });
    } catch (error) {
        console.error('Registration Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') || 'Invalid input data.' });
        }
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
};

// --- User Login Controller ---
exports.loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide email and password.' });
        }
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }
        const token = generateToken(user._id, user.role);
        const userResponse = { ...user._doc };
        delete userResponse.password;
        res.status(200).json({ success: true, message: 'Logged in successfully!', token, user: userResponse });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

// --- Get Current Logged-In User Controller ---
exports.getMe = async (req, res, next) => {
    try {
        if (!req.user || !req.user.id) {
             return res.status(401).json({ success: false, message: 'Not authorized, user data not found in request.' });
        }
        res.status(200).json({ success: true, user: req.user });
    } catch (error) {
        console.error('GetMe Error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching user details.' });
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
            return res.status(400).json({ success: false, message: 'No details provided for update.' });
        }
        const updatedUser = await User.findByIdAndUpdate(userId, fieldsToUpdate, { new: true, runValidators: true }).select('-password');
        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.status(200).json({ success: true, message: 'User details updated successfully!', user: updatedUser });
    } catch (error) {
        console.error('Update User Details Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') || 'Invalid input data for update.' });
        }
        if (error.code === 11000 && error.keyValue && error.keyValue.email) {
            return res.status(400).json({ success: false, message: 'Email address is already in use by another account.' });
        }
        res.status(500).json({ success: false, message: 'Server error while updating user details.' });
    }
};

// --- Update User Password ---
exports.updateUserPassword = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword, confirmNewPassword } = req.body;
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ success: false, message: 'Please provide current password, new password, and confirm new password.' });
        }
        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ success: false, message: 'New password and confirm new password do not match.' });
        }
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect current password.' });
        }
        if (newPassword.length < 8) {
             return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
        }
        user.password = newPassword;
        await user.save();
        res.status(200).json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Update User Password Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') || 'Invalid new password data.' });
        }
        res.status(500).json({ success: false, message: 'Server error while updating password.' });
    }
};

// --- Forgot Password ---
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Please provide an email address.' });
        }
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            console.log(`FORGOT_PASSWORD_INFO: Attempt to reset password for non-existent email: ${email}`);
            return res.status(200).json({
                success: true, 
                message: 'If an account with that email exists, a password reset token has been generated. (Check console for token).',
            });
        }
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false }); 
        
        const savedUser = await User.findById(user._id).select('+passwordResetToken +passwordResetExpires');
        console.log(`FORGOT_PASSWORD_DB_VERIFY: User: ${savedUser.email}, Stored Hashed Token: ${savedUser.passwordResetToken}, Stored Expires: ${savedUser.passwordResetExpires}`);
        console.log(`FORGOT_PASSWORD_SUCCESS: Password reset token for ${user.email}: ${resetToken}`);

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset token has been generated. (Check backend console for token).',
        });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        if (req.body.email) {
            const userToClear = await User.findOne({ email: req.body.email.toLowerCase() });
            if (userToClear) {
                userToClear.passwordResetToken = undefined;
                userToClear.passwordResetExpires = undefined;
                await userToClear.save({ validateBeforeSave: false });
            }
        }
        res.status(500).json({ success: false, message: 'Server error during forgot password process.'});
    }
};

// --- Reset Password ---
exports.resetPassword = async (req, res, next) => {
    try {
        // **** ADDED LOGGING FOR req.params ****
        console.log(`RESET_PASSWORD_INFO: Received req.params:`, JSON.stringify(req.params));
        const unhashedTokenFromParams = req.params.resettoken; // This is how it should be accessed
        // ***************************************

        const { password, confirmPassword } = req.body;

        console.log(`RESET_PASSWORD_INFO: Value of unhashedTokenFromParams: ${unhashedTokenFromParams}`);

        if (!password || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'Please provide new password and confirm password.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        }

        // Only proceed if unhashedTokenFromParams is a non-empty string
        if (!unhashedTokenFromParams || typeof unhashedTokenFromParams !== 'string' || unhashedTokenFromParams.trim() === '') {
            console.log(`RESET_PASSWORD_FAIL: Token from params is invalid or missing.`);
            return res.status(400).json({
                success: false,
                message: 'Password reset token is invalid or missing from the link.',
            });
        }

        const hashedTokenToSearch = crypto
            .createHash('sha256')
            .update(unhashedTokenFromParams)
            .digest('hex');
        
        console.log(`RESET_PASSWORD_INFO: Hashed token being searched in DB: ${hashedTokenToSearch}`);
        console.log(`RESET_PASSWORD_INFO: Current time for expiry check: ${new Date(Date.now())}`);

        const user = await User.findOne({
            passwordResetToken: hashedTokenToSearch,
            passwordResetExpires: { $gt: Date.now() },
        }).select('+passwordResetToken +passwordResetExpires');

        if (!user) {
            console.log(`RESET_PASSWORD_FAIL: User not found with token or token expired.`);
            const userWithExpiredToken = await User.findOne({ passwordResetToken: hashedTokenToSearch });
            if (userWithExpiredToken) {
                console.log(`RESET_PASSWORD_FAIL_DETAIL: User found with token, but token expired. ExpiresAt: ${userWithExpiredToken.passwordResetExpires}, Now: ${new Date(Date.now())}`);
            } else {
                console.log(`RESET_PASSWORD_FAIL_DETAIL: No user found with hashed token: ${hashedTokenToSearch}`);
            }
            return res.status(400).json({
                success: false,
                message: 'Password reset token is invalid or has expired.',
            });
        }
        
        console.log(`RESET_PASSWORD_SUCCESS: User found: ${user.email}, Token Expiry: ${user.passwordResetExpires}`);

        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        const token = generateToken(user._id, user.role);
        const userResponse = { ...user._doc };
        delete userResponse.password;
        delete userResponse.passwordResetToken;
        delete userResponse.passwordResetExpires;

        res.status(200).json({
            success: true,
            message: 'Password reset successful. You are now logged in.',
            token,
            user: userResponse
        });

    } catch (error) {
        console.error('Reset Password Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') });
        }
        res.status(500).json({ success: false, message: 'Server error during password reset.' });
    }
};
