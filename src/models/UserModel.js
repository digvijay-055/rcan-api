// File: rcan-api/src/models/UserModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto'); // For generating reset token

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide your name.'],
        trim: true,
        maxlength: [50, 'Name cannot be more than 50 characters.']
    },
    email: {
        type: String,
        required: [true, 'Please provide your email.'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email address.',
        ],
    },
    password: {
        type: String,
        required: [true, 'Please provide a password.'],
        minlength: [8, 'Password must be at least 8 characters long.'],
        select: false,
    },
    role: {
        type: String,
        enum: ['customer', 'admin'],
        default: 'customer',
    },
    // Fields for password reset
    passwordResetToken: String,
    passwordResetExpires: Date,
    // isActive: { type: Boolean, default: true } // Optional: if you want to deactivate users
}, {
    timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        // If password is changed, clear any existing password reset tokens
        if (this.isModified('password') && !this.isNew) { // Check if it's an update and password changed
            this.passwordResetToken = undefined;
            this.passwordResetExpires = undefined;
        }
        next();
    } catch (error) {
        next(error);
    }
});

// Compare entered password with stored hashed password
userSchema.methods.comparePassword = async function(enteredPassword) {
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Generate and hash password reset token
userSchema.methods.createPasswordResetToken = function() {
    // Generate a random token (this is what the user will receive in the link)
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token and set it to passwordResetToken field (this is what's stored in DB)
    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set token expiration (e.g., 10 minutes from now)
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes in milliseconds

    console.log({ unhashedResetToken: resetToken, hashedTokenInDB: this.passwordResetToken }); // For debugging

    return resetToken; // Return the unhashed token (to be sent to the user)
};

const User = mongoose.model('User', userSchema);

module.exports = User;
