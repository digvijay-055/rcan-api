// File: rcan-api/src/models/OrderModel.js
const mongoose = require('mongoose');

// Schema for individual items within an order
const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', // Reference to the Product model
        required: [true, 'Product ID is required for an order item.'],
    },
    name: { // Denormalized product name at the time of order
        type: String,
        required: [true, 'Product name is required for an order item.'],
        trim: true,
    },
    image: { // Denormalized product image (main one) at the time of order
        type: String, // URL of the image
        trim: true,
        required: false,
    },
    price: { // Price of one unit of the product at the time of order
        type: Number,
        required: [true, 'Price is required for an order item.'],
        min: [0, 'Price cannot be negative.']
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required for an order item.'],
        min: [1, 'Quantity cannot be less than 1.'],
    },
    // No _id for subdocuments if you don't need to query them individually often,
    // but Mongoose adds it by default which is usually fine.
    // _id: false // Uncomment if you want to explicitly disable _id for order items
});

// Main schema for the order
const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the User model
        required: [true, 'User ID is required for an order.'],
    },
    items: [orderItemSchema], // An array of ordered items
    shippingAddress: {
        // Consider making this a more structured object if you have specific fields
        // For now, a simple string or a more detailed object:
        fullName: { type: String, required: [true, 'Full name for shipping is required.'] },
        addressLine1: { type: String, required: [true, 'Address line 1 is required.'] },
        addressLine2: { type: String, required: false },
        city: { type: String, required: [true, 'City is required.'] },
        state: { type: String, required: [true, 'State is required.'] },
        postalCode: { type: String, required: [true, 'Postal code is required.'] },
        country: { type: String, required: [true, 'Country is required.'], default: 'India' },
        phoneNumber: { type: String, required: [true, 'Phone number for shipping is required.'] }
    },
    paymentMethod: { // e.g., 'Stripe', 'PayPal', 'COD' (Cash On Delivery - if you support it)
        type: String,
        required: [true, 'Payment method is required.'],
        trim: true,
    },
    paymentResult: { // Details from the payment gateway
        id: { type: String },         // Transaction ID from payment gateway
        status: { type: String },     // e.g., 'succeeded', 'pending', 'failed'
        update_time: { type: String },// Time of payment update from gateway
        email_address: { type: String } // Payer's email from gateway
    },
    itemsPrice: { // Subtotal for all items
        type: Number,
        required: true,
        default: 0.0,
    },
    taxPrice: { // Calculated tax amount
        type: Number,
        required: true,
        default: 0.0,
    },
    shippingPrice: { // Cost of shipping
        type: Number,
        required: true,
        default: 0.0,
    },
    totalPrice: { // Grand total (itemsPrice + taxPrice + shippingPrice)
        type: Number,
        required: true,
        default: 0.0,
    },
    orderStatus: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Failed'],
        default: 'Pending',
    },
    isPaid: {
        type: Boolean,
        required: true,
        default: false,
    },
    paidAt: {
        type: Date,
    },
    deliveredAt: {
        type: Date,
    },
    
    // Inside orderSchema definition
    razorpayOrderId: {
        type: String,
        // You might not want to make this strictly required initially,
        // as orders might be created before payment ID is known,
        // or for other payment methods like COD.
        // required: true 
    },
    // You might also want to store:
    // - Tracking number for shipping
    // - Notes from the customer
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
});

// Indexing for common query patterns
orderSchema.index({ user: 1, createdAt: -1 }); // For fetching a user's orders, newest first
orderSchema.index({ orderStatus: 1, createdAt: -1 }); // For admin to filter orders by status

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
