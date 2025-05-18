// File: rcan-api/src/models/ProductModel.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required.'],
        trim: true,
        maxlength: [120, 'Product name cannot exceed 120 characters.'],
    },
    description: {
        type: String,
        required: [true, 'Product description is required.'],
        trim: true,
    },
    price: {
        type: Number,
        required: [true, 'Product price is required.'],
        min: [0, 'Price cannot be negative.'],
    },
    category: {
        type: String,
        required: [true, 'Product category is required.'],
        trim: true,
        // Example: You might later use an enum or a reference to a Category collection
        // enum: ['Cookies', 'Cakes', 'Breads', 'Pastries', 'Gifts', 'Plants', 'Seasonal Special']
    },
    images: [ // Array of image URLs
        {
            type: String,
            trim: true,
            // Optional: Basic URL validation
            // validate: {
            //  validator: function(v) {
            //    // A more robust regex might be needed for production
            //    return /^(ftp|http|https):\/\/[^ "]+$/.test(v);
            //  },
            //  message: props => `${props.value} is not a valid URL!`
            // }
        }
    ],
    ingredients: {
        type: [String], // Array of strings for ingredients
        default: [],
    },
    dietaryInfo: { // e.g., ['eggless', 'gluten-free', 'vegan']
        type: [String],
        default: [],
    },
    stockQuantity: {
        type: Number,
        required: [true, 'Stock quantity is required.'],
        min: [0, 'Stock quantity cannot be negative.'],
        default: 0,
        // Ensure integer values if stock can't be fractional
        // validate: {
        //     validator: Number.isInteger,
        //     message: '{VALUE} is not an integer value for stock quantity'
        // }
    },
    // unit: { // e.g., 'per piece', 'per dozen', 'per kg'
    //    type: String,
    //    default: 'per piece'
    // },
    isActive: { // To control if the product is shown to customers
        type: Boolean,
        default: true,
    },
    // You might add more fields like SKU, weight, dimensions, ratings, reviews, etc.
    // createdBy: { // If you want to track which admin added the product
    //    type: mongoose.Schema.Types.ObjectId,
    //    ref: 'User', // This assumes you have a User model
    // }
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
});

// Indexing for better query performance
// Text index for searching across name, description, and category
productSchema.index({ name: 'text', description: 'text', category: 'text' });
// Index for sorting/filtering by price and category
productSchema.index({ price: 1, category: 1 });
// Index for isActive status for quick filtering of active products
productSchema.index({ isActive: 1 });


const Product = mongoose.model('Product', productSchema);

module.exports = Product;
