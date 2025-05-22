// File: rcan-api/src/controllers/productController.js
const Product = require('../models/ProductModel');
const mongoose = require('mongoose');
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
exports.getAllProducts = async (req, res, next) => {
    try {
        let query = {};
        console.log("getAllProducts - Received query params:", req.query);
        console.log("getAllProducts - User making request:", req.user ? { id: req.user.id, role: req.user.role } : "No user/Not authenticated");

        const isAdminRequestingAll = req.user && req.user.role === 'admin' && req.query.isActive === 'all';
        
        if (!isAdminRequestingAll) {
            query.isActive = true; 
        }
        console.log("getAllProducts - Constructed MongoDB query object for products:", query);

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;
        let sort = req.query.sort ? req.query.sort.split(',').join(' ') : '-createdAt';

        const products = await Product.find(query).sort(sort).skip(skip).limit(limit);
        const totalProducts = await Product.countDocuments(query);
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
exports.getProductById = async (req, res, next) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }
        res.status(200).json({ success: true, data: product });
    } catch (error) {
        console.error('Get Product By ID Error:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching product.' });
    }
};

// --- Update a Product by ID ---
exports.updateProduct = async (req, res, next) => {
    console.log(`UPDATE_PRODUCT_START: Attempting to update product ID: ${req.params.id}`);
    console.log("UPDATE_PRODUCT_BODY:", req.body);
    console.log("UPDATE_PRODUCT_FILES:", req.files); // Log uploaded files if any
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.log(`UPDATE_PRODUCT_FAIL: Invalid product ID format: ${productId}`);
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            console.log(`UPDATE_PRODUCT_FAIL: Product not found for ID: ${productId}`);
            return res.status(404).json({ success: false, message: 'Product not found, cannot update.' });
        }
        console.log(`UPDATE_PRODUCT_INFO: Found existing product: ${existingProduct.name}, isActive: ${existingProduct.isActive}`);

        const updates = { ...req.body };
        let newImageUrls = existingProduct.images || [];

        if (req.body.imagesToKeep && Array.isArray(req.body.imagesToKeep)) {
            newImageUrls = req.body.imagesToKeep;
            console.log("UPDATE_PRODUCT_IMAGES: Keeping images based on imagesToKeep:", newImageUrls);
        } else if (req.body.images === '' || (Array.isArray(req.body.images) && req.body.images.length === 0 && Object.prototype.hasOwnProperty.call(req.body, 'images'))) {
            // Check if 'images' key was explicitly sent as empty
            newImageUrls = [];
            console.log("UPDATE_PRODUCT_IMAGES: Clearing all existing images due to empty 'images' field.");
        }


        if (req.files && req.files.length > 0) {
            console.log(`UPDATE_PRODUCT_IMAGES: Uploading ${req.files.length} new images.`);
            const uploadPromises = req.files.map(file =>
                uploadToCloudinary(file.buffer, {
                    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
                })
            );
            const uploadResults = await Promise.all(uploadPromises);
            const uploadedUrls = uploadResults.map(result => result.secure_url);
            newImageUrls = [...newImageUrls, ...uploadedUrls]; // Append new images
            console.log("UPDATE_PRODUCT_IMAGES: New image URLs after upload:", newImageUrls);
        }
        updates.images = newImageUrls;


        const parseStringToArray = (input) => {
            if (input === undefined || input === null) return undefined; 
            if (Array.isArray(input)) return input;
            return String(input).split(',').map(item => item.trim()).filter(item => item);
        };

        if (updates.ingredients !== undefined) updates.ingredients = parseStringToArray(updates.ingredients);
        if (updates.dietaryInfo !== undefined) updates.dietaryInfo = parseStringToArray(updates.dietaryInfo);
        
        if (updates.isActive !== undefined) {
            updates.isActive = String(updates.isActive).toLowerCase() === 'true';
            console.log(`UPDATE_PRODUCT_STATUS: isActive being set to: ${updates.isActive}`);
        } else {
            // If isActive is not in req.body, it means it wasn't changed in the form,
            // so we shouldn't modify it in the 'updates' object unless we want to default it.
            // For a PUT, typically you only update fields that are sent.
            // However, if the form always sends it (even if unchanged), this is fine.
            // If it's possible for isActive NOT to be in req.body, and you want to preserve existing, remove it from 'updates'.
            // delete updates.isActive; // Or ensure it's always sent from form
             console.log(`UPDATE_PRODUCT_STATUS: isActive field not present in request body. Current product isActive: ${existingProduct.isActive}`);
        }
        
        console.log("UPDATE_PRODUCT_FINAL_UPDATES_OBJECT:", updates);

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updates,
            { new: true, runValidators: true }
        );
        
        if (!updatedProduct) {
            // This should ideally not happen if existingProduct was found
            console.log(`UPDATE_PRODUCT_FAIL: findByIdAndUpdate returned null for ID: ${productId}`);
            return res.status(404).json({ success: false, message: 'Product update failed, product may have been deleted concurrently.' });
        }

        console.log(`UPDATE_PRODUCT_SUCCESS: Product ${updatedProduct._id} updated. New isActive: ${updatedProduct.isActive}`);
        res.status(200).json({
            success: true,
            message: 'Product updated successfully!',
            data: updatedProduct,
        });

    } catch (error) {
        console.error('Update Product Error:', error.name, error.message);
        console.error('Update Product Stack:', error.stack);
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
    // **** ADDED LOGGING HERE ****
    console.log(`DELETE_PRODUCT_ATTEMPT: Attempting to delete product ID: ${req.params.id}`);
    console.log(`DELETE_PRODUCT_USER: User making request:`, req.user ? { id: req.user.id, role: req.user.role } : "No user/Not authenticated");
    // ****************************
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.log(`DELETE_PRODUCT_FAIL: Invalid product ID format: ${productId}`);
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            console.log(`DELETE_PRODUCT_FAIL: Product not found for ID: ${productId}`);
            return res.status(404).json({ success: false, message: 'Product not found, cannot delete.' });
        }
        console.log(`DELETE_PRODUCT_INFO: Found product to delete: ${product.name}`);

        // TODO Optional: Delete images from Cloudinary
        // ... (Cloudinary delete logic as before) ...

        await Product.findByIdAndDelete(productId);
        console.log(`DELETE_PRODUCT_SUCCESS: Product ${productId} deleted from database.`);

        res.status(200).json({
            success: true,
            message: 'Product deleted successfully!',
        });
    } catch (error) {
        console.error('Delete Product Error:', error.name, error.message);
        console.error('Delete Product Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting product.',
            errorDetails: error.message
        });
    }
};
