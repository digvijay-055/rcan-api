// File: rcan-api/src/models/WishlistModel.js
const mongoose = require('mongoose');

// Schema for individual items within the wishlist
const wishlistItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', // Reference to the Product model
        required: [true, 'Product ID is required for a wishlist item.'],
    },
    name: { // Denormalized product name for easier display
        type: String,
        required: [true, 'Product name is required for a wishlist item.'],
        trim: true,
    },
    image: { // Denormalized product image (main one) for easier display
        type: String, // URL of the image
        trim: true,
        required: false, // Or true if you want to ensure an image URL is always stored
    },
    priceAtAdd: { // Price of the product at the time of adding to wishlist (optional)
        type: Number,
        required: false, // Make true if you want to always store this
        min: [0, 'Price cannot be negative.']
    },
    addedAt: {
        type: Date,
        default: Date.now,
    }
    // Note: Mongoose adds an _id to subdocuments by default.
});

// Main schema for the wishlist
const wishlistSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model
        required: [true, 'User ID is required for a wishlist.'],
        unique: true, // Ensures each user has only one wishlist document
    },
    items: [wishlistItemSchema], // An array of wishlist items
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields for the wishlist document itself
});

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;
