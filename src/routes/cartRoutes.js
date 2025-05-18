// File: rcan-api/src/routes/cartRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    getCart,
    addItemToCart,
    updateCartItemQuantity,
    removeItemFromCart,
    clearCart
} = require('../controllers/cartController');

// Import authentication middleware
const { protect } = require('../middleware/authMiddleware');

// --- Define Cart Routes ---
// All routes defined here will be prefixed with '/api/v1/cart' (defined in server.js)
// All routes are protected, meaning user must be logged in.

// @desc    Get the logged-in user's cart
// @route   GET /api/v1/cart
// @access  Private
router.get('/', protect, getCart);

// @desc    Add an item to the logged-in user's cart (or update quantity if item exists)
// @route   POST /api/v1/cart/item
// @access  Private
router.post('/item', protect, addItemToCart);

// @desc    Update the quantity of a specific item in the logged-in user's cart
// @route   PUT /api/v1/cart/item/:cartItemId
// @access  Private
router.put('/item/:cartItemId', protect, updateCartItemQuantity);

// @desc    Remove a specific item from the logged-in user's cart
// @route   DELETE /api/v1/cart/item/:cartItemId
// @access  Private
router.delete('/item/:cartItemId', protect, removeItemFromCart);

// @desc    Clear all items from the logged-in user's cart
// @route   DELETE /api/v1/cart
// @access  Private
router.delete('/', protect, clearCart);


module.exports = router;
