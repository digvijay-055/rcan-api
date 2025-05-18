// File: rcan-api/src/controllers/wishlistController.js
const Wishlist = require('../models/WishlistModel');
const Product = require('../models/ProductModel');
const mongoose = require('mongoose'); // For ObjectId validation

// --- Get User's Wishlist ---
// @access  Private
exports.getWishlist = async (req, res, next) => {
    try {
        // req.user.id is populated by the 'protect' middleware
        const userId = req.user.id;

        let wishlist = await Wishlist.findOne({ user: userId });
        // Optionally populate product details if you need more than denormalized fields
        // .populate('items.product', 'name price images stockQuantity isActive category');

        if (!wishlist) {
            // If no wishlist exists for the user, return an empty wishlist structure.
            // A wishlist is typically created when the first item is added.
            return res.status(200).json({
                success: true,
                message: 'Wishlist is empty.',
                data: {
                    _id: null,
                    user: userId,
                    items: [],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }
            });
        }

        res.status(200).json({
            success: true,
            data: wishlist,
        });

    } catch (error) {
        console.error('Get Wishlist Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching wishlist.',
        });
        // next(error); // Or pass to a global error handler
    }
};

// --- Add Item to Wishlist ---
// @access  Private
exports.addItemToWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { productId } = req.body;

        // 1. Validate input
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a productId.',
            });
        }
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format.' });
        }

        // 2. Find the product to get its details for denormalization
        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or not available.',
            });
        }

        // 3. Find user's wishlist or create a new one if it doesn't exist
        let wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            wishlist = await Wishlist.create({ user: userId, items: [] });
        }

        // 4. Check if the product already exists in the wishlist
        const existingItem = wishlist.items.find(
            item => item.product.toString() === productId
        );

        if (existingItem) {
            return res.status(400).json({
                success: false,
                message: 'Product already exists in your wishlist.',
                data: wishlist, // Send current wishlist
            });
        }

        // 5. Product does not exist in wishlist, add new item
        wishlist.items.push({
            product: productId,
            name: product.name,   // Denormalize name
            image: product.images && product.images.length > 0 ? product.images[0] : undefined, // Denormalize first image
            priceAtAdd: product.price, // Store current price (optional, as per model)
            addedAt: new Date(),
        });

        // 6. Save the wishlist
        await wishlist.save();

        // Optionally populate product details for the response if needed for immediate display
        // await wishlist.populate('items.product', 'name price images');

        res.status(200).json({ // Or 201 if you consider adding an item as creating a resource within the wishlist
            success: true,
            message: 'Item added to wishlist successfully!',
            data: wishlist,
        });

    } catch (error) {
        console.error('Add Item to Wishlist Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid wishlist item data.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while adding item to wishlist.',
        });
        // next(error);
    }
};

// --- Remove Item from Wishlist ---
// @access  Private
exports.removeItemFromWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // We'll remove by productId, as that's what the user will likely interact with.
        // Alternatively, you could use the _id of the wishlistItem subdocument if preferred.
        const { productId } = req.params;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing Product ID.' });
        }

        const wishlist = await Wishlist.findOne({ user: userId });
        if (!wishlist) {
            return res.status(404).json({ success: false, message: 'Wishlist not found.' });
        }

        // Find the index of the item to remove
        const itemIndex = wishlist.items.findIndex(
            item => item.product.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: 'Item not found in wishlist.' });
        }

        // Remove the item from the array
        wishlist.items.splice(itemIndex, 1);

        await wishlist.save();

        // await wishlist.populate('items.product', 'name price images'); // If needed

        res.status(200).json({
            success: true,
            message: 'Item removed from wishlist successfully!',
            data: wishlist,
        });

    } catch (error) {
        console.error('Remove Item From Wishlist Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while removing item from wishlist.',
        });
        // next(error);
    }
};
