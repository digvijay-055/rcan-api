// File: rcan-api/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    registerUser,
    loginUser,
    getMe,
    updateUserDetails // Import the new controller function
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


// You can add more auth-related routes here later, e.g.:
// router.post('/forgotpassword', forgotPasswordController);
// router.put('/resetpassword/:resettoken', resetPasswordController);
// router.put('/updatepassword', protect, updateUserPasswordController);

module.exports = router;
