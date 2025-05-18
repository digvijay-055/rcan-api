    // File: rcan-api/src/middleware/multerMiddleware.js
    const multer = require('multer');

    // Configure Multer storage. We'll use memoryStorage for simplicity.
    // This means the file will be stored in memory as a Buffer.
    // For larger files or production, you might consider diskStorage or streaming directly.
    const storage = multer.memoryStorage();

    // Configure Multer file filter to accept only images
    const fileFilter = (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) { // Check if the mimetype indicates an image
            cb(null, true); // Accept the file
        } else {
            cb(new Error('Not an image! Please upload only images.'), false); // Reject the file
        }
    };

    // Configure Multer upload instance
    const upload = multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: 1024 * 1024 * 5, // Limit file size to 5MB (optional)
        },
    });

    // Middleware to handle single image upload (e.g., for a main product image)
    // 'productImage' is the field name in the form-data
    exports.uploadSingleImage = (fieldName) => upload.single(fieldName);

    // Middleware to handle multiple image uploads (e.g., for a product gallery)
    // 'productImages' is the field name, allowing up to, say, 5 images
    exports.uploadMultipleImages = (fieldName, maxCount = 5) => upload.array(fieldName, maxCount);

    // Custom error handling middleware for Multer errors (optional but good practice)
    exports.handleMulterError = (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading.
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'File is too large. Maximum size is 5MB.' });
            }
            // Handle other Multer errors if needed
            return res.status(400).json({ success: false, message: err.message });
        } else if (err) {
            // An unknown error occurred when uploading.
            if (err.message === 'Not an image! Please upload only images.') {
                return res.status(400).json({ success: false, message: err.message });
            }
            return res.status(500).json({ success: false, message: `File upload error: ${err.message}` });
        }
        // Everything went fine, proceed.
        next();
    };
    