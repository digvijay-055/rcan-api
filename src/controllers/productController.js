// File: rcan-api/src/controllers/productController.js
const Product = require('../models/ProductModel');
const mongoose = require('mongoose'); // Ensure mongoose is imported at the top
const { uploadToCloudinary } = require('../config/cloudinaryConfig');

// --- Create a new Product ---
// @access  Private/Admin
exports.createProduct = async (req, res, next) => {
    try {
        const {
            name,
            description,
            price,
            category,
            ingredients, 
            dietaryInfo, 
            stockQuantity,
            isActive
        } = req.body;

        if (!name || !description || price === undefined || !category || stockQuantity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, description, price, category, and stock quantity.',
            });
        }

        let imageUrls = []; 

        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file =>
                uploadToCloudinary(file.buffer, {
                    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
                })
            );
            const uploadResults = await Promise.all(uploadPromises);
            imageUrls = uploadResults.map(result => result.secure_url);
        } else if (req.file) { 
             const result = await uploadToCloudinary(req.file.buffer, {
                folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
            });
            imageUrls.push(result.secure_url);
        }

        const parseStringToArray = (input) => {
            if (!input) return [];
            if (Array.isArray(input)) return input; 
            return input.split(',').map(item => item.trim()).filter(item => item); 
        };

        const product = await Product.create({
            name,
            description,
            price,
            category,
            images: imageUrls,
            ingredients: parseStringToArray(ingredients),
            dietaryInfo: parseStringToArray(dietaryInfo),
            stockQuantity,
            isActive: isActive !== undefined ? (String(isActive).toLowerCase() === 'true') : true,
            // createdBy: req.user.id 
        });

        res.status(201).json({
            success: true,
            message: 'Product created successfully!',
            data: product,
        });

    } catch (error) {
        console.error('Create Product Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join('. ') || 'Invalid product data.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while creating product. Please try again later.',
            errorDetails: error.message 
        });
    }
};

// --- Get all Products ---
// @access  Public (with admin override for isActive=all)
exports.getAllProducts = async (req, res, next) => {
    try {
        let query = {};
        
        // Logging to see what the backend receives
        console.log("getAllProducts - Received query params:", req.query);
        console.log("getAllProducts - User making request:", req.user ? { id: req.user.id, role: req.user.role } : "No user/Not authenticated");

        // Determine if the isActive filter should be applied
        const isAdminRequestingAll = req.user && req.user.role === 'admin' && req.query.isActive === 'all';
        
        if (!isAdminRequestingAll) {
            query.isActive = true; // Default to only active products
        }
        // If isAdminRequestingAll is true, query.isActive remains undefined, so no filter on isActive is applied.

        console.log("getAllProducts - Constructed MongoDB query object for products:", query);


        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        let sort = {};
        if (req.query.sort) {
            const sortBy = req.query.sort.split(',').join(' ');
            sort = sortBy;
        } else {
            sort = '-createdAt';
        }

        const products = await Product.find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(query); // Count based on the same query
        const totalPages = Math.ceil(totalProducts / limit);

        console.log(`getAllProducts - Found ${products.length} products for this page. Total matching: ${totalProducts}.`);

        res.status(200).json({
            success: true,
            count: products.length,
            totalProducts,
            totalPages,
            currentPage: page,
            data: products,
        });
    } catch (error) {
        console.error('Get All Products Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching products.',
        });
    }
};

// --- Get a single Product by ID ---
// @access  Public
exports.getProductById = async (req, res, next) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) { // mongoose was defined locally before, ensure it's global or imported
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        // Optional: If you want to hide inactive products even when accessed by ID by non-admins
        // if (!product.isActive && (!req.user || req.user.role !== 'admin')) {
        //    return res.status(404).json({ success: false, message: 'Product not available.' });
        // }
        res.status(200).json({ success: true, data: product });
    } catch (error) {
        console.error('Get Product By ID Error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching product.' });
    }
};

// --- Update a Product by ID ---
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({ success: false, message: 'Product not found, cannot update.' });
        }

        const updates = { ...req.body };
        // Images are handled differently because they are files
        // We expect 'images' in req.body to be an array of existing image URLs to keep, if any.
        // New images come from req.files.

        let newImageUrls = existingProduct.images || []; // Start with existing images

        // Handle deletion of specific existing images if frontend sends a list of imagesToKeep
        if (req.body.imagesToKeep && Array.isArray(req.body.imagesToKeep)) {
            newImageUrls = req.body.imagesToKeep;
        } else if (req.body.images === '' || (Array.isArray(req.body.images) && req.body.images.length === 0)) {
            // If an empty string or empty array for 'images' is sent, it means clear all existing images
            newImageUrls = [];
        }
        // Note: Deleting old images from Cloudinary would happen here if newImageUrls differs from existingProduct.images

        // Handle new image uploads
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file =>
                uploadToCloudinary(file.buffer, {
                    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
                })
            );
            const uploadResults = await Promise.all(uploadPromises);
            // Append new image URLs to the (potentially modified) list of existing URLs
            newImageUrls = [...newImageUrls, ...uploadResults.map(result => result.secure_url)];
        }
        updates.images = newImageUrls;


        const parseStringToArray = (input) => {
            if (input === undefined || input === null) return undefined; 
            if (Array.isArray(input)) return input;
            return input.split(',').map(item => item.trim()).filter(item => item);
        };

        if (updates.ingredients !== undefined) updates.ingredients = parseStringToArray(updates.ingredients);
        if (updates.dietaryInfo !== undefined) updates.dietaryInfo = parseStringToArray(updates.dietaryInfo);
        if (updates.isActive !== undefined) updates.isActive = String(updates.isActive).toLowerCase() === 'true';


        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updates, // updates object now contains the final images array
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Product updated successfully!',
            data: updatedProduct,
        });

    } catch (error) {
        console.error('Update Product Error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join('. ') || 'Invalid product data for update.' });
        }
        res.status(500).json({
            success: false,
            message: 'Server error while updating product.',
            errorDetails: error.message
        });
    }
};


// --- Delete a Product by ID ---
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found, cannot delete.' });
        }

        // TODO Optional: Delete images from Cloudinary before deleting the product from DB
        // This requires parsing public_id from Cloudinary URLs or storing public_ids.
        // Example:
        // if (product.images && product.images.length > 0) {
        //     const publicIds = product.images.map(url => {
        //         const parts = url.split('/');
        //         const publicIdWithExtension = parts[parts.length -1];
        //         return `${process.env.CLOUDINARY_UPLOAD_FOLDER}/${publicIdWithExtension.split('.')[0]}`;
        //     });
        //     console.log("Attempting to delete from Cloudinary, publicIds:", publicIds);
        //     // await cloudinary.api.delete_resources(publicIds); // This is one way
        // }


        await Product.findByIdAndDelete(productId);

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully!',
        });
    } catch (error) {
        console.error('Delete Product Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting product.',
            errorDetails: error.message
        });
    }
};
