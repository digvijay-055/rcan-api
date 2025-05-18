// File: rcan-api/src/routes/productRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct
} = require('../controllers/productController');

// Import authentication and authorization middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// Import Multer middleware for file uploads and error handler
const {
    uploadMultipleImages, // Or uploadSingleImage if you prefer one main image
    handleMulterError
} = require('../middleware/multerMiddleware');

// --- Define Product Routes ---

// Public routes
// @desc    Get all products (with filtering, sorting, pagination)
// @route   GET /api/v1/products
// @access  Public
router.get('/', getAllProducts);

// @desc    Get a single product by its ID
// @route   GET /api/v1/products/:id
// @access  Public
router.get('/:id', getProductById);


// Admin routes (Protected and Authorized)

// @desc    Create a new product
// @route   POST /api/v1/products
// @access  Private/Admin
// Middleware chain:
// 1. protect: Ensure user is logged in
// 2. authorize('admin'): Ensure user is an admin
// 3. uploadMultipleImages('productImages', 5): Handle up to 5 image uploads from a field named 'productImages'.
//    This populates req.files.
// 4. handleMulterError: Catches errors specifically from Multer (e.g., file type, size).
// 5. createProduct: The actual controller logic.
router.post(
    '/',
    protect,
    authorize('admin'),
    uploadMultipleImages('productImages', 5), // Field name 'productImages', max 5 files
    handleMulterError, // Handles errors from uploadMultipleImages
    createProduct
);

// @desc    Update an existing product by ID
// @route   PUT /api/v1/products/:id
// @access  Private/Admin
// Similar middleware chain as createProduct for handling image uploads during update.
router.put(
    '/:id',
    protect,
    authorize('admin'),
    uploadMultipleImages('productImages', 5), // Field name 'productImages', max 5 files
    handleMulterError,
    updateProduct
);

// @desc    Delete a product by ID
// @route   DELETE /api/v1/products/:id
// @access  Private/Admin
// No file upload middleware needed for delete, but still protected and authorized.
router.delete('/:id', protect, authorize('admin'), deleteProduct);


module.exports = router;
