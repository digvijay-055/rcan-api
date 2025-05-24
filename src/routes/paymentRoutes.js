// File: rcan-api/src/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const { verifyRazorpayWebhook } = require('../controllers/paymentController');

// @desc    Handle Razorpay webhook notifications
// @route   POST /api/v1/payment/webhook/razorpay
// @access  Public (security via signature verification in controller)
router.post('/webhook/razorpay', verifyRazorpayWebhook);

module.exports = router;
