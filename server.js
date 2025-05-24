// File: rcan-api/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// --- Import Routes ---
const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const cartRoutes = require('./src/routes/cartRoutes');
const wishlistRoutes = require('./src/routes/wishlistRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const userAdminRoutes = require('./src/routes/userAdminRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');

const app = express();

// CORS configuration (should be one of the first middleware)
const allowedOrigins = [
    process.env.FRONTEND_URL_DEV,
    process.env.FRONTEND_URL_PROD
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked origin - ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// --- IMPORTANT: Webhook Route for Raw Body ---
// The Razorpay webhook route needs the raw body for signature verification.
// So, we define it *before* the global express.json() middleware.
// We use express.raw() specifically for this route.
app.use('/api/v1/payment/webhook/razorpay', express.raw({ type: 'application/json' }), paymentRoutes);


// --- Global Middleware for other routes ---
// For all other routes, we can use express.json() to parse JSON bodies.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in .env file.');
    process.exit(1);
}
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas!'))
    .catch(err => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    });

// --- API Routes ---
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the rcan.in API! Bakery is open!' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/admin/users', userAdminRoutes);
// Note: The main paymentRoutes (like /webhook/razorpay) is already mounted above with raw body parser.
// If paymentRoutes had other routes needing JSON parsing, they'd need separate mounting or careful structuring.
// For now, assuming paymentRoutes only contains the webhook. If not, this needs adjustment.
// If paymentRoutes has other routes, it's better to mount it like others and handle raw body in the specific route definition within paymentRoutes.js
// However, for a single webhook route, the above approach is common.

// --- Not Found Route Handler ---
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found - Cannot ${req.method} ${req.originalUrl}`
    });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error("Global Error Handler Triggered ---");
    console.error("Error Name:", err.name);
    console.error("Error Message:", err.message);
    console.error("---------------------------------");
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({
        success: false,
        message: message,
    });
});

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
