// File: rcan-api/src/models/CartModel.js
const mongoose = require('mongoose');

// Schema for individual items within the cart
const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', // Reference to the Product model
        required: [true, 'Product ID is required for a cart item.'],
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required for a cart item.'],
        min: [1, 'Quantity cannot be less than 1.'],
        default: 1,
    },
    price: { // Price of one unit of the product at the time of adding to cart
        type: Number,
        required: [true, 'Price is required for a cart item.'],
        min: [0, 'Price cannot be negative.']
    },
    name: { // Denormalized product name for easier display in cart
        type: String,
        required: [true, 'Product name is required for a cart item.'],
        trim: true,
    },
    image: { // Denormalized product image (main one) for easier display in cart
        type: String, // URL of the image
        trim: true,
        required: false, // Or true if you want to ensure an image URL is always stored
    }
    // Note: Mongoose adds an _id to subdocuments by default, which is fine.
});

// Main schema for the cart
const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model
        required: [true, 'User ID is required for a cart.'],
        unique: true, // Ensures each user has only one cart document
    },
    items: [cartItemSchema], // An array of cart items
    // We can calculate the total price dynamically in the controller or via a virtual property.
    // For now, we'll calculate it on the fly.
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
});

// Optional: Virtual property to calculate total cart price
// This is calculated on the fly and not stored in the database.
cartSchema.virtual('totalCartPrice').get(function() {
    return this.items.reduce((total, item) => {
        return total + (item.quantity * item.price);
    }, 0);
});

// Ensure virtuals are included when converting to JSON (e.g., for API responses)
cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });


const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;
