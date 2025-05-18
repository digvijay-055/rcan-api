// File: rcan-api/src/controllers/productController.js
const Product = require('../models/ProductModel');
const mongoose = require('mongoose');
// Import the Cloudinary uploader function
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
            ingredients, // Expect as comma-separated string or array
            dietaryInfo, // Expect as comma-separated string or array
            stockQuantity,
            isActive
        } = req.body;

        // 1. Basic validation
        if (!name || !description || price === undefined || !category || stockQuantity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, description, price, category, and stock quantity.',
            });
        }

        let imageUrls = []; // To store URLs of uploaded images

        // 2. Handle Image Uploads (if files are present)
        // Assuming 'productImages' is the field name used in multerMiddleware.uploadMultipleImages
        if (req.files && req.files.length > 0) {
            // Upload multiple images in parallel
            const uploadPromises = req.files.map(file =>
                uploadToCloudinary(file.buffer, {
                    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
                    // You can add transformations or other options here
                    // public_id: `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}` // Optional: custom public_id
                })
            );

            const uploadResults = await Promise.all(uploadPromises);
            imageUrls = uploadResults.map(result => result.secure_url);
        } else if (req.file) { // Handle single image upload if 'productImage' was used
             const result = await uploadToCloudinary(req.file.buffer, {
                folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
            });
            imageUrls.push(result.secure_url);
        }


        // Helper to parse comma-separated strings into arrays if needed
        const parseStringToArray = (input) => {
            if (!input) return [];
            if (Array.isArray(input)) return input; // Already an array
            return input.split(',').map(item => item.trim()).filter(item => item); // Split, trim, and remove empty strings
        };

        // 3. Create product with image URLs
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
            // createdBy: req.user.id // If you associate product with admin
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
        // Handle Cloudinary upload errors specifically if needed, though uploadToCloudinary should reject
        res.status(500).json({
            success: false,
            message: 'Server error while creating product. Please try again later.',
            errorDetails: error.message // For debugging
        });
    }
};

// --- Get all Products ---
// @access  Public
exports.getAllProducts = async (req, res, next) => {
    try {
        let query = {};
        if (req.query.category) {
            query.category = req.query.category;
        }
        if (req.query.isActive !== 'all') {
             query.isActive = true;
        } else if (req.user && req.user.role === 'admin' && req.query.isActive === 'all') {
            // No modification to query
        } else {
            query.isActive = true;
        }

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

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

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

        // Prepare updates from req.body
        const updates = { ...req.body };
        delete updates.images; // Handle images separately

        let newImageUrls = [];

        // Handle new image uploads
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file =>
                uploadToCloudinary(file.buffer, {
                    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
                })
            );
            const uploadResults = await Promise.all(uploadPromises);
            newImageUrls = uploadResults.map(result => result.secure_url);
        } else if (req.file) { // Handle single new image upload
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products',
            });
            newImageUrls.push(result.secure_url);
        }

        // Decide how to handle existing images vs new images
        // Option 1: Replace all existing images with new ones (if any new ones are uploaded)
        if (newImageUrls.length > 0) {
            // TODO Optional: Delete old images from Cloudinary to save space
            // This requires storing public_ids of Cloudinary images or parsing them from URLs.
            // For now, we'll just overwrite the image array.
            updates.images = newImageUrls;
        } else if (req.body.existingImages) {
            // Option 2: Allow frontend to send back a list of existing image URLs to keep,
            // and potentially new ones are added. This is more complex to manage.
            // For simplicity, if no new files are uploaded, we keep existing images unless
            // an empty `images` array is explicitly sent in req.body to clear them.
            // If `req.body.images` is sent (e.g. as an array of URLs to keep, or empty to clear), use that.
            // This part needs careful frontend-backend coordination.
            // For now, if no new images, existing images are kept unless `updates.images = []` is explicitly in body.
            if(req.body.images && Array.isArray(req.body.images)) {
                updates.images = req.body.images; // Allows clearing or reordering existing images
            }
        }
        // If `updates.images` is not set by new uploads or explicitly in body, existing images are preserved by default.


        // Helper to parse comma-separated strings into arrays if needed
        const parseStringToArray = (input) => {
            if (input === undefined || input === null) return undefined; // Don't process if not provided
            if (Array.isArray(input)) return input;
            return input.split(',').map(item => item.trim()).filter(item => item);
        };

        if (updates.ingredients !== undefined) updates.ingredients = parseStringToArray(updates.ingredients);
        if (updates.dietaryInfo !== undefined) updates.dietaryInfo = parseStringToArray(updates.dietaryInfo);
        if (updates.isActive !== undefined) updates.isActive = String(updates.isActive).toLowerCase() === 'true';


        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updates,
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
        // if (product.images && product.images.length > 0) {
        //     const deletePromises = product.images.map(imageUrl => {
        //         const publicId = cloudinary.utils.public_id(imageUrl); // Helper to extract public_id
        //         return cloudinary.uploader.destroy(publicId);
        //     });
        //     await Promise.all(deletePromises);
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
