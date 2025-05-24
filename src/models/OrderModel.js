// File: rcan-api/src/models/OrderModel.js
const mongoose = require('mongoose');

// Schema for individual items within an order
const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', 
        required: [true, 'Product ID is required for an order item.'],
    },
    name: { 
        type: String,
        required: [true, 'Product name is required for an order item.'],
        trim: true,
    },
    image: { 
        type: String, 
        trim: true,
        required: false,
    },
    price: { 
        type: Number,
        required: [true, 'Price is required for an order item.'],
        min: [0, 'Price cannot be negative.']
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required for an order item.'],
        min: [1, 'Quantity cannot be less than 1.'],
    },
});

// Main schema for the order
const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: [true, 'User ID is required for an order.'],
    },
    items: [orderItemSchema], 
    shippingAddress: {
        fullName: { type: String, required: [true, 'Full name for shipping is required.'] },
        addressLine1: { type: String, required: [true, 'Address line 1 is required.'] },
        addressLine2: { type: String, required: false },
        city: { type: String, required: [true, 'City is required.'] },
        state: { type: String, required: [true, 'State is required.'] },
        postalCode: { type: String, required: [true, 'Postal code is required.'] },
        country: { type: String, required: [true, 'Country is required.'], default: 'India' },
        phoneNumber: { type: String, required: [true, 'Phone number for shipping is required.'] }
    },
    paymentMethod: { 
        type: String,
        required: [true, 'Payment method is required.'],
        trim: true,
    },
    paymentResult: { 
        id: { type: String },        
        status: { type: String },    
        update_time: { type: String },
        email_address: { type: String } 
    },
    razorpayOrderId: { // For storing Razorpay's order ID
        type: String,
    },
    itemsPrice: { 
        type: Number,
        required: true,
        default: 0.0,
    },
    taxPrice: { 
        type: Number,
        required: true,
        default: 0.0,
    },
    shippingPrice: { 
        type: Number,
        required: true,
        default: 0.0,
    },
    totalPrice: { 
        type: Number,
        required: true,
        default: 0.0,
    },
    orderStatus: {
        type: String,
        required: true,
        enum: ['Pending Payment', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Failed'], // Added 'Pending Payment'
        default: 'Pending Payment', // Changed default to 'Pending Payment' if that's the most common initial state
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
}, {
    timestamps: true, 
});

orderSchema.index({ user: 1, createdAt: -1 }); 
orderSchema.index({ orderStatus: 1, createdAt: -1 }); 

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
