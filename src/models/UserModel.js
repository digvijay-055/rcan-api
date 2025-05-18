// File: rcan-api/src/models/UserModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing

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
        unique: true, // Ensures no two users can have the same email
        lowercase: true, // Converts email to lowercase before saving
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
        select: false, // Password field will not be returned in queries by default
    },
    role: {
        type: String,
        enum: ['customer', 'admin'], // Defines possible roles
        default: 'customer', // Default role for new users
    },
    // Optional: You can add more fields like phoneNumber, profilePicture, etc.
    // addresses: [ // Example of an array of subdocuments for multiple addresses
    //     {
    //         street: String,
    //         city: String,
    //         state: String,
    //         postalCode: String,
    //         country: { type: String, default: 'India' },
    //         isDefault: { type: Boolean, default: false }
    //     }
    // ],
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
});

// Mongoose middleware to hash password before saving the user document
userSchema.pre('save', async function(next) {
    // Only run this function if password was actually modified (or is new)
    if (!this.isModified('password')) {
        return next();
    }
    // Hash the password with a salt round of 12
    // bcryptjs is asynchronous, so we use await
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error); // Pass errors to the next middleware
    }
});

// Instance method to compare entered password with the hashed password in the database
userSchema.methods.comparePassword = async function(enteredPassword) {
    // bcryptjs.compare is asynchronous
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        throw error; // Or handle error as appropriate
    }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
