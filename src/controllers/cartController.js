// File: rcan-api/src/controllers/cartController.js
const Cart = require('../models/CartModel');
const Product = require('../models/ProductModel');
const mongoose = require('mongoose'); // For ObjectId validation

// --- Get User's Cart ---
// @access  Private
exports.getCart = async (req, res, next) => {
    try {
        // req.user.id is populated by the 'protect' middleware
        const userId = req.user.id;

        let cart = await Cart.findOne({ user: userId })
                             // .populate('items.product', 'name price images stockQuantity isActive'); // Optionally populate full product details

        if (!cart) {
            // If no cart exists for the user, we can either return an empty cart
            // or create one. For now, let's return a message or an empty structure.
            // Or, more practically, a cart is usually created when the first item is added.
            // So, if getCart is called and no cart exists, it implies an empty cart.
            return res.status(200).json({
                success: true,
                message: 'Cart is empty.',
                data: {
                    _id: null, // Or a new mongoose.Types.ObjectId() if you want to simulate an ID
                    user: userId,
                    items: [],
                    totalCartPrice: 0, // Assuming virtual works or calculate here
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }
            });
        }

        // Ensure virtuals are included if you rely on them and they aren't by default
        // (though we set it in the model, being explicit here can be useful for debugging)
        // const cartObject = cart.toObject({ virtuals: true });


        res.status(200).json({
            success: true,
            data: cart, // Send the cart object, which should include virtuals if set in model
        });

    } catch (error) {
        console.error('Get Cart Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching cart.',
        });
        // next(error);
    }
};

// --- Add Item to Cart (or update quantity if item exists) ---
// @access  Private
exports.addItemToCart = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { productId, quantity } = req.body;

        // 1. Validate input
        if (!productId || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Please provide productId and quantity.',
            });
        }
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid Product ID format.' });
        }
        const numQuantity = parseInt(quantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be a positive number.',
            });
        }

        // 2. Find the product to get its current details (price, name, image, stock)
        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or not available.',
            });
        }

        // Basic stock check (can be made more robust later with transactions)
        if (product.stockQuantity < numQuantity) {
            return res.status(400).json({
                success: false,
                message: `Sorry, only ${product.stockQuantity} units of ${product.name} are available.`,
            });
        }

        // 3. Find user's cart or create a new one if it doesn't exist
        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            cart = await Cart.create({ user: userId, items: [] });
        }

        // 4. Check if the product already exists in the cart
        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Product exists, update quantity
            const newQuantity = cart.items[existingItemIndex].quantity + numQuantity;
             // Re-check stock for the new total quantity
            if (product.stockQuantity < newQuantity) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot add ${numQuantity} more. Only ${product.stockQuantity - cart.items[existingItemIndex].quantity} additional units of ${product.name} available. Total stock is ${product.stockQuantity}.`,
                });
            }
            cart.items[existingItemIndex].quantity = newQuantity;
            // Price, name, image are already set from when it was first added.
            // If product details (price) could change, you might want to update item.price here too.
            // For simplicity, we assume price is fixed from first add.
        } else {
            // Product does not exist, add new item
            cart.items.push({
                product: productId,
                quantity: numQuantity,
                price: product.price, // Store price at the time of adding
                name: product.name,   // Denormalize name
                image: product.images && product.images.length > 0 ? product.images[0] : undefined, // Denormalize first image
            });
        }

        // 5. Save the cart
        await cart.save();

        // Optionally populate product details for the response
        // await cart.populate('items.product', 'name price images');

        res.status(200).json({
            success: true,
            message: 'Item added to cart successfully!',
            data: cart,
        });

    } catch (error) {
        console.error('Add Item to Cart Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid cart item data.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while adding item to cart.',
        });
        // next(error);
    }
};

// --- Update Item Quantity in Cart ---
// @access  Private
exports.updateCartItemQuantity = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { cartItemId } = req.params; // Assuming cartItemId is the _id of the subdocument item
        const { quantity } = req.body;

        // 1. Validate input
        if (!cartItemId || quantity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide cart item ID and quantity.',
            });
        }
        if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
            return res.status(400).json({ success: false, message: 'Invalid Cart Item ID format.' });
        }
        const numQuantity = parseInt(quantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            // To remove an item, use the remove endpoint. Quantity must be at least 1.
            return res.status(400).json({
                success: false,
                message: 'Quantity must be a positive number. To remove, use the delete item endpoint.',
            });
        }

        // 2. Find the cart
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found.' });
        }

        // 3. Find the item in the cart
        const itemToUpdate = cart.items.id(cartItemId); // Mongoose subdocument .id() method
        if (!itemToUpdate) {
            return res.status(404).json({ success: false, message: 'Item not found in cart.' });
        }

        // 4. Check product stock for the new quantity
        const product = await Product.findById(itemToUpdate.product);
        if (!product || !product.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Associated product not found or not available.',
            });
        }
        if (product.stockQuantity < numQuantity) {
            return res.status(400).json({
                success: false,
                message: `Sorry, only ${product.stockQuantity} units of ${product.name} are available.`,
            });
        }

        // 5. Update quantity
        itemToUpdate.quantity = numQuantity;

        // 6. Save the cart
        await cart.save();

        // await cart.populate('items.product', 'name price images');

        res.status(200).json({
            success: true,
            message: 'Cart item quantity updated successfully!',
            data: cart,
        });

    } catch (error) {
        console.error('Update Cart Item Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid cart item data for update.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while updating cart item.',
        });
        // next(error);
    }
};

// --- Remove Item from Cart ---
// @access  Private
exports.removeItemFromCart = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { cartItemId } = req.params; // Assuming cartItemId is the _id of the subdocument item

        if (!cartItemId || !mongoose.Types.ObjectId.isValid(cartItemId)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing Cart Item ID.' });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found.' });
        }

        const itemToRemove = cart.items.id(cartItemId);
        if (!itemToRemove) {
            return res.status(404).json({ success: false, message: 'Item not found in cart.' });
        }

        // Mongoose way to remove a subdocument from an array
        itemToRemove.deleteOne(); // or cart.items.pull({ _id: cartItemId });

        await cart.save();

        // await cart.populate('items.product', 'name price images');

        res.status(200).json({
            success: true,
            message: 'Item removed from cart successfully!',
            data: cart,
        });

    } catch (error) {
        console.error('Remove Item From Cart Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while removing item from cart.',
        });
        // next(error);
    }
};

// --- Clear Entire Cart ---
// @access  Private
exports.clearCart = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            // If no cart, it's effectively already cleared.
            return res.status(200).json({
                success: true,
                message: 'Cart is already empty.',
                data: { user: userId, items: [] }
            });
        }

        cart.items = []; // Empty the items array
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Cart cleared successfully!',
            data: cart, // Cart will now have an empty items array
        });

    } catch (error) {
        console.error('Clear Cart Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while clearing cart.',
        });
        // next(error);
    }
};
