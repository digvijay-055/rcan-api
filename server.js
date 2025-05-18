// File: rcan-api/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // Loads environment variables from .env file

// --- Import Routes ---
const authRoutes = require('./src/routes/authRoutes');
const productRoutes = require('./src/routes/productRoutes');
const cartRoutes = require('./src/routes/cartRoutes');
const wishlistRoutes = require('./src/routes/wishlistRoutes');
const orderRoutes = require('./src/routes/orderRoutes'); // Import order routes

// Initialize Express app
const app = express();

// Middleware
// CORS configuration
const allowedOrigins = [
    process.env.FRONTEND_URL_DEV,
    process.env.FRONTEND_URL_PROD
].filter(Boolean); // Filter out undefined values if some are not set

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, Postman, curl) during development or for specific use cases
        // For production, you might want to be stricter or ensure FRONTEND_URL_PROD is correctly set
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked origin - ${origin}`); // Log blocked origins for debugging
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true // If you need to send cookies or authorization headers from the frontend
}));

app.use(express.json()); // Parses incoming requests with JSON payloads
app.use(express.urlencoded({ extended: true })); // Parses incoming requests with URL-encoded payloads

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in .env file.');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB Atlas!');
    })
    .catch(err => {
        console.error('MongoDB connection error:', err.message);
        process.exit(1); // Exit process with failure if DB connection fails
    });

// --- API Routes ---
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the rcan.in API! Bakery is open!' });
});

// Mount Authentication Routes
app.use('/api/v1/auth', authRoutes);

// Mount Product Routes
app.use('/api/v1/products', productRoutes);

// Mount Cart Routes
app.use('/api/v1/cart', cartRoutes);

// Mount Wishlist Routes
app.use('/api/v1/wishlist', wishlistRoutes);

// Mount Order Routes
app.use('/api/v1/orders', orderRoutes); // Add this line


// --- Not Found Route Handler ---
// This should be placed after all other specific routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found - Cannot ${req.method} ${req.originalUrl}`
    });
});

// --- Global Error Handler ---
// This should ideally be the last middleware
app.use((err, req, res, next) => {
    console.error("Global Error Handler Triggered ---");
    console.error("Error Name:", err.name);
    console.error("Error Message:", err.message);
    // console.error("Error Stack:", err.stack); // Uncomment for detailed stack in logs
    console.error("---------------------------------");

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message: message,
        // Optionally, include stack trace in development environment for the response
        // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
});


// Start the server
const PORT = process.env.PORT || 5001; // Use port from .env or default to 5001
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
