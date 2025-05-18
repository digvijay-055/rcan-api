    // File: rcan-api/src/config/cloudinaryConfig.js
    const cloudinary = require('cloudinary').v2; // Use v2 for the latest SDK features
    require('dotenv').config(); // Ensure environment variables are loaded

    // Configure Cloudinary with credentials from .env file
    // This needs to be done once when your application starts.
    // Usually, you'd call this configuration logic in your main server.js or a dedicated config loader.
    // However, for simplicity in accessing cloudinary.uploader, we can configure it here
    // and ensure this module is imported where needed.

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error("FATAL ERROR: Cloudinary credentials are not defined in .env file.");
        // process.exit(1); // Or handle this more gracefully depending on your app's startup sequence
    } else {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
            secure: true, // Ensures HTTPS URLs are generated
        });
        console.log("Cloudinary configured successfully.");
    }


    // Optional: Function to upload an image buffer or file path to Cloudinary
    const uploadToCloudinary = (fileBuffer, options = {}) => {
        return new Promise((resolve, reject) => {
            // Default options can be set here
            const defaultOptions = {
                folder: process.env.CLOUDINARY_UPLOAD_FOLDER || 'rcan_bakery_products', // Default folder
                // resource_type: 'image', // 'image', 'video', 'raw', or 'auto'
                // transformation: [{ width: 500, height: 500, crop: "limit" }] // Example transformation
                ...options // Merge with any options passed to the function
            };

            // Cloudinary's uploader.upload_stream can take a buffer
            const uploadStream = cloudinary.uploader.upload_stream(defaultOptions, (error, result) => {
                if (error) {
                    console.error('Cloudinary Upload Error:', error);
                    return reject(error);
                }
                resolve(result);
            });

            // If fileBuffer is a path, use uploader.upload. For buffers, use upload_stream.
            // For simplicity with multer's memoryStorage, we'll use upload_stream with the buffer.
            uploadStream.end(fileBuffer);
        });
    };


    module.exports = { cloudinary, uploadToCloudinary };
    