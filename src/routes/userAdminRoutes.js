// File: rcan-api/src/routes/userAdminRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const {
    getAllUsers,
    getUserById,
    updateUserById,
    deleteUserById
} = require('../controllers/userAdminController');

// Import authentication and authorization middleware
const { protect, authorize } = require('../middleware/authMiddleware');

// --- Define Admin User Management Routes ---
// All routes defined here will be prefixed with something like '/api/v1/admin/users' (defined in server.js)
// All routes are protected to ensure only logged-in admins can access them.

// @desc    Get all users (Admin)
// @route   GET /api/v1/admin/users
// @access  Private/Admin
router.get('/', protect, authorize('admin'), getAllUsers);

// @desc    Get a single user by ID (Admin)
// @route   GET /api/v1/admin/users/:id
// @access  Private/Admin
router.get('/:id', protect, authorize('admin'), getUserById);

// @desc    Update a user's details by ID (Admin) - e.g., change role, name, email
// @route   PUT /api/v1/admin/users/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), updateUserById);

// @desc    Delete a user by ID (Admin)
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), deleteUserById);

module.exports = router;
