// File: rcan-api/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    registerUser,
    loginUser,
    getMe
} = require('../controllers/authController');

// Import authentication middleware (we will create this in the next step)
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
router.get('/me', protect, getMe); // 'protect' middleware will be executed before 'getMe'

// You can add more auth-related routes here later, e.g.:
// router.post('/forgotpassword', forgotPasswordController);
// router.put('/resetpassword/:resettoken', resetPasswordController);
// router.put('/updatepassword', protect, updateUserPasswordController); // For logged-in users to change their password

module.exports = router;
