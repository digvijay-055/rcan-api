// File: rcan-api/src/controllers/userAdminController.js
const User = require('../models/UserModel');
const mongoose = require('mongoose');

// --- Get All Users (Admin) ---
// @desc    Get all registered users with pagination
// @route   GET /api/v1/admin/users
// @access  Private/Admin
exports.getAllUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 users per page
        const skip = (page - 1) * limit;

        let sort = {};
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            sort = sortBy;
        } else {
            sort = '-createdAt'; // Default sort by newest registration
        }
        
        // Optional: Add search/filter capabilities later if needed
        // const queryFilter = {};
        // if (req.query.search) {
        //     queryFilter.name = { $regex: req.query.search, $options: 'i' }; // Case-insensitive search by name
        // }
        // if (req.query.role) {
        //     queryFilter.role = req.query.role;
        // }

        const users = await User.find(/* queryFilter */)
            .select('-password') // Exclude passwords from the result
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const totalUsers = await User.countDocuments(/* queryFilter */);
        const totalPages = Math.ceil(totalUsers / limit);

        res.status(200).json({
            success: true,
            count: users.length,
            totalUsers,
            totalPages,
            currentPage: page,
            data: users,
        });

    } catch (error) {
        console.error('Get All Users (Admin) Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching users.',
        });
    }
};

// --- Get Single User by ID (Admin) ---
// @desc    Get details of a specific user by their ID
// @route   GET /api/v1/admin/users/:id
// @access  Private/Admin
exports.getUserById = async (req, res, next) => {
    try {
        const userId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format.' });
        }

        const user = await User.findById(userId).select('-password'); // Exclude password

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        res.status(200).json({
            success: true,
            data: user,
        });

    } catch (error) {
        console.error('Get User By ID (Admin) Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user details.',
        });
    }
};

// --- Update User Details by ID (Admin) ---
// @desc    Admin updates a user's details (e.g., role, name, email)
// @route   PUT /api/v1/admin/users/:id
// @access  Private/Admin
exports.updateUserById = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const { name, email, role /*, isActive (if you add this field to UserModel) */ } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format.' });
        }

        // Fields that an admin can update
        const fieldsToUpdate = {};
        if (name) fieldsToUpdate.name = name;
        if (email) fieldsToUpdate.email = email.toLowerCase(); // Ensure email is lowercase
        if (role && ['customer', 'admin'].includes(role)) { // Validate role
            fieldsToUpdate.role = role;
        }
        // if (isActive !== undefined) fieldsToUpdate.isActive = isActive;


        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({ success: false, message: 'No details provided for update.' });
        }

        // Prevent admin from accidentally changing their own role to non-admin if they are the only admin
        // (More complex logic might be needed for multi-admin scenarios)
        if (req.user.id === userId && fieldsToUpdate.role && fieldsToUpdate.role !== 'admin') {
             const adminCount = await User.countDocuments({ role: 'admin' });
             if (adminCount <= 1) {
                return res.status(400).json({ success: false, message: 'Cannot remove the last admin role.' });
             }
        }


        const updatedUser = await User.findByIdAndUpdate(userId, fieldsToUpdate, {
            new: true, // Return the updated document
            runValidators: true, // Ensure schema validations are run
        }).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'User updated successfully by admin!',
            data: updatedUser,
        });

    } catch (error) {
        console.error('Update User By ID (Admin) Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') });
        }
        if (error.code === 11000 && error.keyValue && error.keyValue.email) { // MongoDB duplicate key error for email
            return res.status(400).json({ success: false, message: 'Email address is already in use.' });
        }
        res.status(500).json({ success: false, message: 'Server error while updating user.' });
    }
};


// --- Delete User by ID (Admin) ---
// @desc    Admin deletes a user
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Admin
exports.deleteUserById = async (req, res, next) => {
    try {
        const userId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format.' });
        }

        // Critical: Prevent admin from deleting themselves
        if (req.user.id === userId) {
            return res.status(400).json({ success: false, message: 'Administrators cannot delete their own account.' });
        }
        
        // Optional: Prevent deletion of the last admin account
        const userToDelete = await User.findById(userId);
        if (!userToDelete) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        if (userToDelete.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                return res.status(400).json({ success: false, message: 'Cannot delete the last admin account.' });
            }
        }

        await User.findByIdAndDelete(userId);

        res.status(200).json({
            success: true,
            message: 'User deleted successfully by admin.',
        });

    } catch (error) {
        console.error('Delete User By ID (Admin) Error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting user.' });
    }
};
