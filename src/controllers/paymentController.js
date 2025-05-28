// File: rcan-api/src/controllers/paymentController.js
const crypto = require('crypto');
const Order = require('../models/OrderModel');
const Product = require('../models/ProductModel');
const mongoose = require('mongoose');

exports.verifyRazorpayWebhook = async (req, res) => {
    console.log("RAZORPAY_WEBHOOK: Received a webhook request.");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (!secret) {
        console.error("RAZORPAY_WEBHOOK_ERROR: Webhook secret is not configured.");
        return res.status(500).json({ success: false, message: "Webhook secret misconfiguration." });
    }

    // req.body is now a Buffer because of express.raw()
    const requestBodyString = req.body.toString(); // Convert buffer to string

    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(requestBodyString); // Use the raw string body for signature verification
    const digest = shasum.digest('hex');

    const razorpaySignature = req.headers['x-razorpay-signature'];
    console.log("RAZORPAY_WEBHOOK: Received Signature:", razorpaySignature);
    console.log("RAZORPAY_WEBHOOK: Generated Digest:", digest);

    if (digest !== razorpaySignature) {
        console.warn("RAZORPAY_WEBHOOK_WARN: Invalid signature. Request might be tampered.");
        return res.status(400).json({ success: false, status: 'Signature mismatch' });
    }

    console.log("RAZORPAY_WEBHOOK: Signature verified successfully.");
    
    // Now parse the string body to get the JSON payload
    let parsedBody;
    try {
        parsedBody = JSON.parse(requestBodyString);
    } catch (parseError) {
        console.error("RAZORPAY_WEBHOOK_ERROR: Failed to parse request body JSON:", parseError);
        return res.status(400).json({ success: false, status: 'Invalid JSON payload' });
    }

    const event = parsedBody.event;
    const payload = parsedBody.payload;

    console.log(`RAZORPAY_WEBHOOK: Event Type: ${event}`);

    if (event === 'order.paid' || event === 'payment.captured') {
        const paymentEntity = payload.payment.entity;
        const orderEntity = payload.order.entity;

        const razorpayOrderId = orderEntity.id;
        const razorpayPaymentId = paymentEntity.id;
        const paymentStatus = paymentEntity.status;
        const paymentTimestamp = paymentEntity.created_at ? new Date(paymentEntity.created_at * 1000) : new Date();

        console.log(`RAZORPAY_WEBHOOK: Processing successful payment for Razorpay Order ID: ${razorpayOrderId}, Payment ID: ${razorpayPaymentId}`);

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const internalOrder = await Order.findOne({ razorpayOrderId: razorpayOrderId }).session(session);

            if (!internalOrder) {
                console.error(`RAZORPAY_WEBHOOK_ERROR: Internal order not found for Razorpay Order ID: ${razorpayOrderId}`);
                await session.abortTransaction(); session.endSession();
                return res.status(200).json({ success: false, message: `Internal order not found for ${razorpayOrderId}. Webhook acknowledged.` });
            }

            if (internalOrder.isPaid) {
                console.log(`RAZORPAY_WEBHOOK_INFO: Order ${internalOrder._id} already marked as paid. Ignoring duplicate webhook.`);
                await session.abortTransaction(); session.endSession();
                return res.status(200).json({ success: true, message: "Order already paid. Webhook acknowledged." });
            }

            internalOrder.isPaid = true;
            internalOrder.paidAt = paymentTimestamp;
            internalOrder.orderStatus = 'Processing';
            internalOrder.paymentResult = {
                id: razorpayPaymentId,
                status: paymentStatus,
                update_time: paymentTimestamp.toISOString(),
                email_address: paymentEntity.email,
            };
            
            await internalOrder.save({ session });
            console.log(`RAZORPAY_WEBHOOK: Internal order ${internalOrder._id} updated to Paid. Status: Processing.`);
            
            await session.commitTransaction();
            session.endSession();
            console.log(`RAZORPAY_WEBHOOK: Transaction committed for order ${internalOrder._id}.`);

        } catch (dbError) {
            console.error(`RAZORPAY_WEBHOOK_DB_ERROR: Error updating internal order for ${razorpayOrderId}:`, dbError);
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            session.endSession();
            return res.status(500).json({ success: false, message: "Error updating order in database."});
        }
    } else if (event === 'payment.failed') {
        const paymentEntity = payload.payment.entity;
        const orderEntity = payload.order.entity;
        const razorpayOrderId = orderEntity.id;
        console.warn(`RAZORPAY_WEBHOOK: Payment failed for Razorpay Order ID: ${razorpayOrderId}. Error: ${paymentEntity.error_description}`);
        // Optionally update your internal order status to 'Failed Payment'
    } else {
        console.log(`RAZORPAY_WEBHOOK: Received unhandled event type: ${event}`);
    }

    res.status(200).json({ success: true, status: 'Webhook received' });
};
