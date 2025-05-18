// File: rcan-api/src/routes/wishlistRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    getWishlist,
    addItemToWishlist,
    removeItemFromWishlist
} = require('../controllers/wishlistController');

// Import authentication middleware
const { protect } = require('../middleware/authMiddleware');

// --- Define Wishlist Routes ---
// All routes defined here will be prefixed with '/api/v1/wishlist' (as defined in server.js)
// All routes are protected, meaning the user must be logged in.

// @desc    Get the logged-in user's wishlist
// @route   GET /api/v1/wishlist
// @access  Private
router.get('/', protect, getWishlist);

// @desc    Add an item to the logged-in user's wishlist
// @route   POST /api/v1/wishlist/item
// @access  Private
// Body should contain { "productId": "your_product_id_here" }
router.post('/item', protect, addItemToWishlist);

// @desc    Remove a specific item (by productId) from the logged-in user's wishlist
// @route   DELETE /api/v1/wishlist/item/:productId
// @access  Private
router.delete('/item/:productId', protect, removeItemFromWishlist);

module.exports = router;
