// File: rcan-api/src/controllers/authController.js
const User = require('../models/UserModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // For generating and hashing reset token

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
        await user.save(); // This will trigger the pre-save hook for hashing and clearing reset tokens
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
// @desc    Generate a password reset token (and "send" it - we'll log it for now)
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Please provide an email address.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Important: Don't reveal if an email exists or not for security reasons
            // Send a generic success message even if user not found
            console.log(`FORGOT_PASSWORD_INFO: Attempt to reset password for non-existent email: ${email}`);
            return res.status(200).json({
                success: true, // Still send success=true
                message: 'If an account with that email exists, a password reset token has been generated. (Check console for token).',
            });
        }

        // Generate the reset token using the method on the User model
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false }); // Save the user with the new reset token and expiry. Skip validation for this save.

        // In a real app, you would send an email here:
        // const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`; // Or your frontend URL
        // try {
        //   await sendEmail({ email: user.email, subject: 'Your Password Reset Token (valid for 10 min)', message: `Reset URL: ${resetUrl}` });
        //   res.status(200).json({ success: true, message: 'Token sent to email!' });
        // } catch (err) {
        //   console.error('EMAIL_ERROR:', err);
        //   user.passwordResetToken = undefined;
        //   user.passwordResetExpires = undefined;
        //   await user.save({ validateBeforeSave: false });
        //   return res.status(500).json({ success: false, message: 'Error sending email. Try again.'});
        // }

        // For now, we log the token (this is the UNHASHED token)
        console.log(`FORGOT_PASSWORD_SUCCESS: Password reset token for ${user.email}: ${resetToken}`);
        console.log(`FORGOT_PASSWORD_INFO: Hashed token stored in DB for ${user.email}: ${user.passwordResetToken}`);

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset token has been generated. (Check backend console for token).',
            // DO NOT SEND THE TOKEN IN THE RESPONSE FOR SECURITY REASONS
        });

    } catch (error) {
        console.error('Forgot Password Error:', error);
        // Ensure tokens are cleared if any unexpected error occurs during the process
        // This part might need refinement depending on where the error happens
        if (req.body.email) {
            const userToClear = await User.findOne({ email: req.body.email.toLowerCase() });
            if (userToClear) {
                userToClear.passwordResetToken = undefined;
                userToClear.passwordResetExpires = undefined;
                await userToClear.save({ validateBeforeSave: false });
            }
        }
        res.status(500).json({
            success: false,
            message: 'Server error during forgot password process.',
        });
    }
};


// --- Reset Password ---
// @desc    Reset password using a token
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
exports.resetPassword = async (req, res, next) => {
    try {
        const unhashedTokenFromParams = req.params.resettoken;
        const { password, confirmPassword } = req.body;

        if (!password || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'Please provide new password and confirm password.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        }

        // 1. Hash the token received in the URL params to match the one stored in DB
        const hashedToken = crypto
            .createHash('sha256')
            .update(unhashedTokenFromParams)
            .digest('hex');

        // 2. Find user by the hashed token and check if token is not expired
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }, // Check if expiry date is greater than now
        });

        if (!user) {
            return res.status(400).json({ // 400 Bad Request or 401 Unauthorized
                success: false,
                message: 'Password reset token is invalid or has expired.',
            });
        }

        // 3. If token is valid, set the new password
        user.password = password; // The pre-save hook in UserModel will hash it
        user.passwordResetToken = undefined; // Clear the token
        user.passwordResetExpires = undefined; // Clear the expiry
        await user.save(); // This also triggers the pre-save hook to clear tokens

        // 4. Log the user in (optional, but good UX) by generating a new JWT
        const token = generateToken(user._id, user.role);
        const userResponse = { ...user._doc };
        delete userResponse.password;


        res.status(200).json({
            success: true,
            message: 'Password reset successful. You are now logged in.',
            token, // Send new token for auto-login
            user: userResponse
        });

    } catch (error) {
        console.error('Reset Password Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') });
        }
        res.status(500).json({
            success: false,
            message: 'Server error during password reset.',
        });
    }
};
