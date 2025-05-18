// File: rcan-api/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    createOrder,
    getMyOrders,
    getOrderById,
    updateOrderStatus,
    getAllOrdersAdmin
} = require('../controllers/orderController');

// Import authentication and authorization middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// --- Define Order Routes ---
// All routes defined here will be prefixed with '/api/v1/orders' (as defined in server.js)

// @desc    Create a new order
// @route   POST /api/v1/orders
// @access  Private (User must be logged in)
router.post('/', protect, createOrder);

// @desc    Get logged-in user's order history
// @route   GET /api/v1/orders/myorders
// @access  Private
router.get('/myorders', protect, getMyOrders);

// @desc    Get all orders (for Admin)
// @route   GET /api/v1/orders
// @access  Private/Admin
router.get('/', protect, authorize('admin'), getAllOrdersAdmin);

// @desc    Get a single order by its ID
// @route   GET /api/v1/orders/:id
// @access  Private (User can get their own, Admin can get any)
router.get('/:id', protect, getOrderById); // Authorization logic is within getOrderById controller

// @desc    Update order status (e.g., to paid, shipped, delivered)
// @route   PUT /api/v1/orders/:id/status
// @access  Private/Admin
router.put('/:id/status', protect, authorize('admin'), updateOrderStatus);

// Example route for admin to mark an order as paid (if not using a payment gateway webhook for this)
// router.put('/:id/pay', protect, authorize('admin'), updateOrderToPaid); // You would create this controller

// Example route for admin to mark an order as delivered
// router.put('/:id/deliver', protect, authorize('admin'), updateOrderToDelivered); // You would create this controller


module.exports = router;
