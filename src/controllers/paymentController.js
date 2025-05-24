// File: rcan-api/src/controllers/paymentController.js
const crypto = require('crypto');
const Order = require('../models/OrderModel');
const Product = require('../models/ProductModel'); // Needed if restoring stock on payment failure
const mongoose = require('mongoose');

// --- Verify Razorpay Webhook Signature and Handle Payment Event ---
// @desc    Handle Razorpay webhook notifications
// @route   POST /api/v1/payment/webhook/razorpay
// @access  Public (but secured by signature verification)
exports.verifyRazorpayWebhook = async (req, res) => {
    console.log("RAZORPAY_WEBHOOK: Received a webhook request.");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET; // Use a dedicated webhook secret if set, else key secret

    if (!secret) {
        console.error("RAZORPAY_WEBHOOK_ERROR: Webhook secret is not configured.");
        return res.status(500).json({ success: false, message: "Webhook secret misconfiguration." });
    }

    // Step 1: Validate the webhook signature
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(req.body)); // req.body must be the raw, unparsed JSON string for signature verification
    const digest = shasum.digest('hex');

    const razorpaySignature = req.headers['x-razorpay-signature'];
    console.log("RAZORPAY_WEBHOOK: Received Signature:", razorpaySignature);
    console.log("RAZORPAY_WEBHOOK: Generated Digest:", digest);

    if (digest !== razorpaySignature) {
        console.warn("RAZORPAY_WEBHOOK_WARN: Invalid signature. Request might be tampered.");
        return res.status(400).json({ success: false, status: 'Signature mismatch' });
    }

    console.log("RAZORPAY_WEBHOOK: Signature verified successfully.");
    const event = req.body.event; // e.g., 'payment.captured', 'order.paid'
    const payload = req.body.payload;

    console.log(`RAZORPAY_WEBHOOK: Event Type: ${event}`);
    // console.log("RAZORPAY_WEBHOOK: Full Payload:", JSON.stringify(payload, null, 2));


    // Step 2: Handle the event
    // We are primarily interested in successful payment events.
    // Razorpay recommends listening to 'payment.captured' for card payments, UPI, etc.
    // and 'order.paid' for a more general success status including netbanking.
    // For simplicity, let's react to 'order.paid' as it's more encompassing.
    // You might need to handle 'payment.failed' as well.

    if (event === 'order.paid' || event === 'payment.captured') {
        const paymentEntity = payload.payment.entity;
        const orderEntity = payload.order.entity; // Contains notes if you passed them

        const razorpayOrderId = orderEntity.id; // This is Razorpay's order_id
        const razorpayPaymentId = paymentEntity.id;
        const paymentStatus = paymentEntity.status; // 'captured', 'authorized', 'failed'
        const paymentAmount = paymentEntity.amount / 100; // Convert from paise to rupees
        const paymentCurrency = paymentEntity.currency;
        const paymentMethod = paymentEntity.method;
        const payerEmail = paymentEntity.email;
        const paymentTimestamp = paymentEntity.created_at ? new Date(paymentEntity.created_at * 1000) : new Date();


        console.log(`RAZORPAY_WEBHOOK: Processing successful payment for Razorpay Order ID: ${razorpayOrderId}, Payment ID: ${razorpayPaymentId}`);

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            // Find your internal order using the razorpayOrderId
            const internalOrder = await Order.findOne({ razorpayOrderId: razorpayOrderId }).session(session);

            if (!internalOrder) {
                console.error(`RAZORPAY_WEBHOOK_ERROR: Internal order not found for Razorpay Order ID: ${razorpayOrderId}`);
                // Important: Still send 200 to Razorpay to acknowledge receipt, but log error.
                // Razorpay will retry if it doesn't get a 200.
                await session.abortTransaction(); session.endSession();
                return res.status(200).json({ success: false, message: `Internal order not found for ${razorpayOrderId}. Webhook acknowledged.` });
            }

            if (internalOrder.isPaid) {
                console.log(`RAZORPAY_WEBHOOK_INFO: Order ${internalOrder._id} already marked as paid. Ignoring duplicate webhook.`);
                await session.abortTransaction(); session.endSession();
                return res.status(200).json({ success: true, message: "Order already paid. Webhook acknowledged." });
            }

            // Update your internal order
            internalOrder.isPaid = true;
            internalOrder.paidAt = paymentTimestamp;
            internalOrder.orderStatus = 'Processing'; // Or 'Paid'
            internalOrder.paymentResult = {
                id: razorpayPaymentId,
                status: paymentStatus, // 'captured'
                update_time: paymentTimestamp.toISOString(),
                email_address: payerEmail,
            };
            // paymentMethod might already be set, or you can update it here if more specific
            // internalOrder.paymentMethod = `Razorpay - ${paymentMethod}`;

            await internalOrder.save({ session });
            console.log(`RAZORPAY_WEBHOOK: Internal order ${internalOrder._id} updated to Paid. Status: Processing.`);
            
            // Note: Stock was already decremented when the order was created with 'Pending Payment'.
            // If payment had failed, you'd need a mechanism to restore stock (e.g., if order remains 'Pending Payment' for too long and is cancelled).

            await session.commitTransaction();
            session.endSession();
            console.log(`RAZORPAY_WEBHOOK: Transaction committed for order ${internalOrder._id}.`);

        } catch (dbError) {
            console.error(`RAZORPAY_WEBHOOK_DB_ERROR: Error updating internal order for ${razorpayOrderId}:`, dbError);
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            session.endSession();
            // Don't send 500 to Razorpay if possible, as they will retry.
            // Log the error and investigate. For critical DB errors, a 500 might be unavoidable.
            // Ideally, have robust error handling and retries for DB updates.
            return res.status(500).json({ success: false, message: "Error updating order in database."}); // Or 200 with error logged internally
        }
    } else if (event === 'payment.failed') {
        const paymentEntity = payload.payment.entity;
        const orderEntity = payload.order.entity; // Contains notes if you passed them
        const razorpayOrderId = orderEntity.id;
        console.warn(`RAZORPAY_WEBHOOK: Payment failed for Razorpay Order ID: ${razorpayOrderId}. Error: ${paymentEntity.error_description}`);
        
        // Optionally update your internal order status to 'Failed Payment'
        // And consider if stock needs to be restored if it was pre-emptively decremented.
        // (Our current `createOrder` decrements stock immediately).
        // If an order stays 'Pending Payment' due to a failed payment, an admin might need to cancel it to restore stock.
    } else {
        console.log(`RAZORPAY_WEBHOOK: Received unhandled event type: ${event}`);
    }

    // Acknowledge receipt of the webhook to Razorpay
    res.status(200).json({ success: true, status: 'Webhook received' });
};
