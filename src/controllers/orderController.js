// File: rcan-api/src/controllers/orderController.js
const Order = require('../models/OrderModel');
const Cart = require('../models/CartModel');
const Product = require('../models/ProductModel');
const mongoose = require('mongoose');

// --- Create New Order ---
// @access  Private
exports.createOrder = async (req, res, next) => {
    const session = await mongoose.startSession(); // Start a new session for the transaction
    session.startTransaction(); // Start the transaction

    try {
        const userId = req.user.id; // From protect middleware

        const {
            shippingAddress,
            paymentMethod,
            taxPrice: taxPriceInput, // Renaming to avoid conflict with calculated variable
            shippingPrice: shippingPriceInput,
        } = req.body;

        // 1. Validate basic input
        if (!shippingAddress || !paymentMethod) {
            await session.abortTransaction(); // Abort transaction before returning
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Please provide shipping address and payment method.',
            });
        }
        // Add more detailed validation for shippingAddress fields if necessary here

        // 2. Get the user's cart (within the transaction session)
        const cart = await Cart.findOne({ user: userId }).session(session);

        if (!cart || cart.items.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty. Cannot create an order.',
            });
        }

        // 3. Prepare order items and simultaneously check stock & prepare stock updates
        const orderItems = [];
        let itemsPrice = 0;
        const stockUpdatePromises = []; // To hold promises for stock updates

        for (const cartItem of cart.items) {
            const product = await Product.findById(cartItem.product).session(session); // Fetch product within session

            if (!product) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({
                    success: false,
                    message: `Product with ID ${cartItem.product} not found.`,
                });
            }
            if (!product.isActive) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    success: false,
                    message: `Product "${product.name}" is currently not available.`,
                });
            }
            if (product.stockQuantity < cartItem.quantity) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({
                    success: false,
                    message: `Not enough stock for "${product.name}". Only ${product.stockQuantity} left, but ${cartItem.quantity} requested.`,
                });
            }

            // If stock is sufficient, add to orderItems and prepare stock update
            orderItems.push({
                product: product._id,
                name: product.name, // Using fresh name from product
                image: product.images && product.images.length > 0 ? product.images[0] : undefined, // Fresh image
                price: product.price, // Using fresh price from product
                quantity: cartItem.quantity,
            });

            itemsPrice += product.price * cartItem.quantity;

            // Prepare the stock update operation (don't execute yet, just prepare)
            stockUpdatePromises.push(
                Product.findByIdAndUpdate(
                    product._id,
                    { $inc: { stockQuantity: -cartItem.quantity } }, // Decrement stock
                    { session } // Pass the session to this operation
                )
            );
        }

        // 4. Calculate final prices
        const taxPrice = parseFloat(taxPriceInput) || 0;
        const shippingPrice = parseFloat(shippingPriceInput) || 0;
        const totalPrice = itemsPrice + taxPrice + shippingPrice;

        // 5. Create the order object
        const order = new Order({
            user: userId,
            items: orderItems,
            shippingAddress,
            paymentMethod,
            itemsPrice: itemsPrice.toFixed(2),
            taxPrice: taxPrice.toFixed(2),
            shippingPrice: shippingPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            orderStatus: 'Pending',
            isPaid: false,
        });

        // 6. Save the order (within the transaction session)
        // Note: Mongoose `create` doesn't directly accept a session for the top-level document in some versions/setups easily.
        // So, we create an instance and then save it with the session.
        const createdOrderArray = await Order.create([order], { session }); // Use array for create with session
        const createdOrder = createdOrderArray[0];


        // 7. Execute all stock updates (within the transaction session)
        await Promise.all(stockUpdatePromises);


        // 8. Clear the user's cart (within the transaction session)
        await Cart.findOneAndDelete({ user: userId }).session(session);


        // 9. If all operations were successful, commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            success: true,
            message: 'Order created successfully and stock updated!',
            data: createdOrder,
        });

    } catch (error) {
        // If any error occurs, abort the transaction
        console.error('Create Order Transaction Error:', error);
        await session.abortTransaction();
        session.endSession();

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid order data.',
            });
        }
        // Handle specific error messages thrown during stock check etc.
        if (error.message.includes('Not enough stock') || error.message.includes('not available') || error.message.includes('not found')) {
             return res.status(400).json({ success: false, message: error.message });
        }

        res.status(500).json({
            success: false,
            message: 'Server error during order creation. Transaction rolled back.',
            // error: error.message // For debugging in dev
        });
        // next(error); // Or pass to a global error handler
    }
};

// --- Get Logged-in User's Orders ---
// @access  Private
exports.getMyOrders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 }); // Newest first

        if (!orders || orders.length === 0) {
            return res.status(200).json({ // 200 OK, but no orders
                success: true,
                message: 'You have no orders yet.',
                data: [],
            });
        }

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders,
        });
    } catch (error) {
        console.error('Get My Orders Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching your orders.',
        });
    }
};

// --- Get Order by ID ---
// @access  Private (User can get their own, Admin can get any)
exports.getOrderById = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid Order ID format.' });
        }

        const order = await Order.findById(orderId).populate('user', 'name email');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this order.',
            });
        }

        res.status(200).json({
            success: true,
            data: order,
        });
    } catch (error) {
        console.error('Get Order By ID Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching order details.',
        });
    }
};

// --- Update Order Status (e.g., to Paid, Shipped, Delivered) ---
// @access  Private/Admin
exports.updateOrderStatus = async (req, res, next) => {
    // For this function, if updating stock (e.g., on cancellation),
    // ensure to use a transaction as well if multiple operations are involved.
    // For simple status updates, a transaction might be overkill unless it triggers other dependent writes.
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const orderId = req.params.id;
        const { orderStatus, isPaid, paymentResult } = req.body;

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid Order ID format.' });
        }

        const order = await Order.findById(orderId).session(session);

        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Order not found.',
            });
        }

        let stockRestorePromises = []; // For restoring stock on cancellation

        if (orderStatus) {
            // If order is being cancelled AND it was previously in a state where stock was deducted
            // (e.g., Pending, Processing, or even Paid before shipping)
            if (orderStatus === 'Cancelled' && ['Pending', 'Processing', 'Paid'].includes(order.orderStatus)) {
                for (const item of order.items) {
                    stockRestorePromises.push(
                        Product.findByIdAndUpdate(
                            item.product,
                            { $inc: { stockQuantity: item.quantity } }, // Increment stock back
                            { session }
                        )
                    );
                }
            }
            order.orderStatus = orderStatus;
            if (orderStatus === 'Delivered' && !order.deliveredAt) {
                order.deliveredAt = Date.now();
            }
             // If payment is confirmed through status update (e.g. COD confirmation)
            if (orderStatus === 'Paid' && !order.isPaid) {
                order.isPaid = true;
                order.paidAt = Date.now();
            }
        }

        if (isPaid !== undefined) {
            order.isPaid = isPaid;
            if (isPaid && !order.paidAt) {
                order.paidAt = Date.now();
            } else if (!isPaid) {
                order.paidAt = undefined;
            }
        }
        if (paymentResult) {
            order.paymentResult = {
                id: paymentResult.id || (order.paymentResult ? order.paymentResult.id : undefined),
                status: paymentResult.status || (order.paymentResult ? order.paymentResult.status : undefined),
                update_time: paymentResult.update_time || (order.paymentResult ? order.paymentResult.update_time : undefined),
                email_address: paymentResult.email_address || (order.paymentResult ? order.paymentResult.email_address : undefined),
            };
            if (paymentResult.status === 'succeeded' || paymentResult.status === 'completed' || paymentResult.status === 'captured') { // Adjust based on gateway
                order.isPaid = true;
                order.paidAt = paymentResult.update_time ? new Date(paymentResult.update_time) : Date.now();
                if (order.orderStatus === 'Pending') order.orderStatus = 'Processing';
            }
        }

        if (stockRestorePromises.length > 0) {
            await Promise.all(stockRestorePromises);
        }

        const updatedOrder = await order.save({ session }); // Save order within session

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            success: true,
            message: 'Order status updated successfully!',
            data: updatedOrder,
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Update Order Status Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid order data for update.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while updating order status. Transaction rolled back.',
        });
    }
};


// --- Get All Orders (Admin) ---
// @access  Private/Admin
exports.getAllOrdersAdmin = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        let sort = {};
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            sort = sortBy;
        } else {
            sort = '-createdAt';
        }

        let query = {};
        if (req.query.status) {
            query.orderStatus = req.query.status;
        }
        if (req.query.userId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
                 return res.status(400).json({ success: false, message: 'Invalid User ID format for filtering.' });
            }
            query.user = req.query.userId;
        }


        const orders = await Order.find(query)
            .populate('user', 'name email')
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.status(200).json({
            success: true,
            count: orders.length,
            totalOrders,
            totalPages,
            currentPage: page,
            data: orders,
        });
    } catch (error) {
        console.error('Get All Orders (Admin) Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching all orders.',
        });
    }
};
