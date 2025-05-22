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
const orderRoutes = require('./src/routes/orderRoutes');
const userAdminRoutes = require('./src/routes/userAdminRoutes'); // Import admin user routes

// Initialize Express app
const app = express();

// Middleware
// CORS configuration
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

app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

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
        process.exit(1); 
    });

// --- API Routes ---
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the rcan.in API! Bakery is open!' });
});

// Mount Authentication Routes (for general users)
app.use('/api/v1/auth', authRoutes);

// Mount Product Routes (public and admin-protected within the file)
app.use('/api/v1/products', productRoutes);

// Mount Cart Routes (user-protected)
app.use('/api/v1/cart', cartRoutes);

// Mount Wishlist Routes (user-protected)
app.use('/api/v1/wishlist', wishlistRoutes);

// Mount Order Routes (user and admin-protected within the file)
app.use('/api/v1/orders', orderRoutes);

// Mount Admin User Management Routes (admin-protected)
app.use('/api/v1/admin/users', userAdminRoutes); // Add this line


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
    // console.error("Error Stack:", err.stack); 
    console.error("---------------------------------");

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message: message,
        // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
});


// Start the server
const PORT = process.env.PORT || 5001; 
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
