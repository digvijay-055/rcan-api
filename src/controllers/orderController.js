// File: rcan-api/src/controllers/orderController.js
const Order = require('../models/OrderModel');
const Cart = require('../models/CartModel');
const Product = require('../models/ProductModel');
const mongoose = require('mongoose');
const razorpay = require('../config/razorpayConfig'); // Import configured Razorpay instance

// --- Create New Order ---
// This function now also creates a Razorpay order if paymentMethod is 'Razorpay' (or similar)
exports.createOrder = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    console.log('ORDER_CREATE: Transaction started.');

    try {
        const userId = req.user.id;
        const {
            shippingAddress,
            paymentMethod, // e.g., "Razorpay", "COD"
            taxPrice: taxPriceInput,
            shippingPrice: shippingPriceInput,
        } = req.body;

        if (!shippingAddress || !paymentMethod) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ success: false, message: 'Please provide shipping address and payment method.' });
        }

        const cart = await Cart.findOne({ user: userId }).session(session);
        if (!cart || cart.items.length === 0) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ success: false, message: 'Your cart is empty. Cannot create an order.' });
        }
        console.log('ORDER_CREATE: Cart fetched successfully.');

        const orderItems = [];
        let itemsPrice = 0;
        const stockUpdatePromises = []; // Changed from stockSavePromises to avoid confusion

        for (const cartItem of cart.items) {
            const product = await Product.findById(cartItem.product).session(session);
            console.log(`ORDER_CREATE: Processing cart item - Product ID: ${cartItem.product}, Name: ${product ? product.name : 'N/A'}, Requested Qty: ${cartItem.quantity}`);
            if (!product) {
                await session.abortTransaction(); session.endSession();
                return res.status(404).json({ success: false, message: `Product with ID ${cartItem.product} not found. Order rolled back.`});
            }
            if (!product.isActive) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ success: false, message: `Product "${product.name}" is currently not available. Order rolled back.`});
            }
            if (product.stockQuantity < cartItem.quantity) {
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ success: false, message: `Not enough stock for "${product.name}". Only ${product.stockQuantity} left, but ${cartItem.quantity} requested. Order rolled back.` });
            }
            orderItems.push({
                product: product._id, name: product.name,
                image: product.images && product.images.length > 0 ? product.images[0] : undefined,
                price: product.price, quantity: cartItem.quantity,
            });
            itemsPrice += product.price * cartItem.quantity;
            
            // Prepare stock update
            stockUpdatePromises.push(
                Product.findByIdAndUpdate(
                    product._id,
                    { $inc: { stockQuantity: -cartItem.quantity } },
                    { session, new: true, runValidators: true } // ensure to use session and get updated doc if needed
                )
            );
            console.log(`ORDER_CREATE: Product ${product.name} - stock to be updated. Requested: ${cartItem.quantity}, New intended stock: ${product.stockQuantity - cartItem.quantity}`);
        }

        const taxPrice = parseFloat(taxPriceInput) || 0;
        const shippingPrice = parseFloat(shippingPriceInput) || 0;
        const totalPrice = itemsPrice + taxPrice + shippingPrice;
        const totalPriceInPaise = Math.round(totalPrice * 100); // Razorpay expects amount in smallest currency unit (paise for INR)

        console.log(`ORDER_CREATE: Calculated itemsPrice: ${itemsPrice}, taxPrice: ${taxPrice}, shippingPrice: ${shippingPrice}, totalPrice: ${totalPrice}, totalPriceInPaise: ${totalPriceInPaise}`);

        let razorpayPaymentDetailsForFrontend = null;
        let internalOrderData = {
            user: userId,
            items: orderItems,
            shippingAddress,
            paymentMethod,
            itemsPrice: itemsPrice.toFixed(2),
            taxPrice: taxPrice.toFixed(2),
            shippingPrice: shippingPrice.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            isPaid: false,
            orderStatus: paymentMethod.toLowerCase() === 'cod' ? 'Processing' : 'Pending Payment', // COD goes to Processing, others Pending Payment
        };

        // Create Razorpay order ONLY if payment method indicates online payment (e.g., 'Razorpay')
        if (paymentMethod.toLowerCase() === 'razorpay' || paymentMethod.toLowerCase() === 'online') {
            if (totalPriceInPaise <= 0) { // Razorpay requires amount > 0
                await session.abortTransaction(); session.endSession();
                return res.status(400).json({ success: false, message: 'Order total must be greater than zero for online payment.' });
            }
            const razorpayOrderOptions = {
                amount: totalPriceInPaise,
                currency: "INR",
                receipt: `rcan_receipt_${new mongoose.Types.ObjectId()}`, // Unique receipt ID for your reference
                notes: { // You can pass additional info here
                    internalUserId: userId.toString(), // Example
                    itemCount: orderItems.length.toString()
                }
            };
            try {
                const createdRazorpayOrder = await razorpay.orders.create(razorpayOrderOptions);
                console.log("ORDER_CREATE: Razorpay order created successfully:", createdRazorpayOrder);
                
                internalOrderData.razorpayOrderId = createdRazorpayOrder.id; // Add Razorpay order ID to our order data
                
                razorpayPaymentDetailsForFrontend = { // Prepare details for frontend
                    razorpayOrderId: createdRazorpayOrder.id,
                    amount: createdRazorpayOrder.amount, // Amount in paise
                    currency: createdRazorpayOrder.currency,
                    keyId: process.env.RAZORPAY_KEY_ID, // Your Razorpay Key ID
                };
            } catch (razorpayError) {
                console.error("ORDER_CREATE_FAIL: Razorpay order creation failed:", razorpayError);
                await session.abortTransaction(); session.endSession();
                // Provide more specific error if possible
                const errorMessage = razorpayError.error && razorpayError.error.description 
                                   ? razorpayError.error.description 
                                   : "Failed to create payment order with Razorpay. Please try again.";
                return res.status(500).json({ success: false, message: errorMessage, details: razorpayError.error });
            }
            if (!internalOrderData.razorpayOrderId) { // Double check
                await session.abortTransaction(); session.endSession();
                return res.status(500).json({ success: false, message: "Critical error: Razorpay Order ID missing after creation attempt." });
            }
        }

        console.log('ORDER_CREATE: Attempting to save internal order document:', internalOrderData);
        const createdOrderArray = await Order.create([internalOrderData], { session });
        const createdOrder = createdOrderArray[0];
        console.log(`ORDER_CREATE: Internal order ${createdOrder._id} saved successfully. Status: ${createdOrder.orderStatus}`);

        // Execute all stock updates
        await Promise.all(stockUpdatePromises);
        console.log('ORDER_CREATE: Stock update operations executed successfully.');

        // Clear the user's cart
        await Cart.findOneAndDelete({ user: userId }).session(session);
        console.log('ORDER_CREATE: Cart deleted successfully.');

        await session.commitTransaction();
        console.log('ORDER_CREATE: Transaction committed successfully.');
        session.endSession();

        res.status(201).json({
            success: true,
            message: `Order ${razorpayPaymentDetailsForFrontend ? 'initiated! Proceed to payment.' : 'placed successfully!'}`,
            order: createdOrder, // Your internal order
            paymentDetails: razorpayPaymentDetailsForFrontend, // This will be null if not a Razorpay/Online order
        });

    } catch (error) {
        console.error('ORDER_CREATE_TRANSACTION_ERROR:', error.message, error.stack);
        if (session.inTransaction()) {
            await session.abortTransaction();
            console.log('ORDER_CREATE: Transaction aborted due to error.');
        }
        session.endSession();
        // Handle specific error messages thrown during stock check etc.
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') || 'Invalid order data.' });
        }
        if (error.message.includes('stock') || error.message.includes('not available') || error.message.includes('not found')) {
             return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error during order creation. Please try again later.' });
    }
};

// --- (Rest of the controller functions: getMyOrders, getOrderById, updateOrderStatus, getAllOrdersAdmin) ---
// These should be the same as your existing, tested versions.
// Note: updateOrderStatus will need significant changes later for handling webhook verification.

exports.getMyOrders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
        if (!orders || orders.length === 0) {
            return res.status(200).json({ success: true, message: 'You have no orders yet.', data: [] });
        }
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        console.error('Get My Orders Error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching your orders.' });
    }
};

exports.getOrderById = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid Order ID format.' });
        }
        const order = await Order.findById(orderId).populate('user', 'name email');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }
        if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to view this order.' });
        }
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        console.error('Get Order By ID Error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching order details.' });
    }
};

exports.updateOrderStatus = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const orderId = req.params.id;
        const { orderStatus, isPaid, paymentResult } = req.body; // paymentResult from admin manual update

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            await session.abortTransaction(); session.endSession();
            return res.status(400).json({ success: false, message: 'Invalid Order ID format.' });
        }
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            await session.abortTransaction(); session.endSession();
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        let stockRestorePromises = [];
        const previousOrderStatus = order.orderStatus;

        if (orderStatus) {
            if (orderStatus === 'Cancelled' && 
                ['Pending Payment', 'Pending', 'Processing', 'Paid'].includes(previousOrderStatus) && 
                order.orderStatus !== 'Cancelled') {
                for (const item of order.items) {
                    stockRestorePromises.push(
                        Product.findByIdAndUpdate(item.product, { $inc: { stockQuantity: item.quantity } }, { session })
                    );
                }
            }
            order.orderStatus = orderStatus;
            if (orderStatus === 'Delivered' && !order.deliveredAt) order.deliveredAt = Date.now();
            if (orderStatus === 'Paid' && !order.isPaid) { // Admin manually setting to Paid
                order.isPaid = true;
                order.paidAt = Date.now();
            }
        }
        if (isPaid !== undefined) { // Admin directly setting isPaid
            order.isPaid = isPaid;
            if (isPaid && !order.paidAt) order.paidAt = Date.now();
            else if (!isPaid) order.paidAt = undefined; // If admin unsets isPaid
        }
        if (paymentResult) { // Admin manually adding payment details
            order.paymentResult = { ...order.paymentResult, ...paymentResult };
            if (['succeeded', 'completed', 'captured', 'paid'].includes(paymentResult.status?.toLowerCase()) && !order.isPaid) {
                order.isPaid = true;
                order.paidAt = paymentResult.update_time ? new Date(paymentResult.update_time) : Date.now();
                if (order.orderStatus === 'Pending Payment' || order.orderStatus === 'Pending') {
                    order.orderStatus = 'Processing';
                }
            }
        }
        if (order.isPaid && (order.orderStatus === 'Pending Payment' || order.orderStatus === 'Pending')) {
             order.orderStatus = 'Processing';
        }


        if (stockRestorePromises.length > 0) {
            await Promise.all(stockRestorePromises);
        }
        const updatedOrder = await order.save({ session });
        await session.commitTransaction(); session.endSession();
        res.status(200).json({ success: true, message: 'Order status updated successfully!', data: updatedOrder });

    } catch (error) {
        if (session.inTransaction()) { await session.abortTransaction(); }
        session.endSession();
        console.error(`Update Order Status Error:`, error);
        res.status(500).json({ success: false, message: 'Server error while updating order status.' });
    }
};

exports.getAllOrdersAdmin = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;
        let sort = req.query.sort ? req.query.sort.split(',').join(' ') : '-createdAt';
        let query = {};
        if (req.query.status) query.orderStatus = req.query.status;
        if (req.query.userId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
                 return res.status(400).json({ success: false, message: 'Invalid User ID format for filtering.' });
            }
            query.user = req.query.userId;
        }
        const orders = await Order.find(query).populate('user', 'name email').sort(sort).skip(skip).limit(limit);
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);
        res.status(200).json({ success: true, count: orders.length, totalOrders, totalPages, currentPage: page, data: orders });
    } catch (error) {
        console.error('Get All Orders (Admin) Error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching all orders.' });
    }
};
