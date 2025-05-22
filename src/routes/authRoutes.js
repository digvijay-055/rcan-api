// File: rcan-api/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    registerUser,
    loginUser,
    getMe,
    updateUserDetails,
    updateUserPassword,
    forgotPassword,    // Import new function
    resetPassword      // Import new function
} = require('../controllers/authController');

// Import authentication middleware
const { protect } = require('../middleware/authMiddleware');

// --- Define Authentication Routes ---

// @desc    Register a new user
// @route   POST /api/v1/auth/register
// @access  Public
router.post('/register', registerUser);

// @desc    Authenticate user & get token (Login)
// @route   POST /api/v1/auth/login
// @access  Public
router.post('/login', loginUser);

// @desc    Get current logged-in user's details
// @route   GET /api/v1/auth/me
// @access  Private (requires token)
router.get('/me', protect, getMe);

// @desc    Update current logged-in user's details (e.g., name)
// @route   PUT /api/v1/auth/updatedetails
// @access  Private (requires token)
router.put('/updatedetails', protect, updateUserDetails);

// @desc    Update current logged-in user's password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private (requires token)
router.put('/updatepassword', protect, updateUserPassword);

// @desc    Request a password reset token
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
router.post('/forgotpassword', forgotPassword);

// @desc    Reset password using a token
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
router.put('/resetpassword/:resettoken', resetPassword);


module.exports = router;
