const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({  // Use a unique schema name
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    items: [
        {
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'products', 
                required: true,
            }
        }
    ],
}, { timestamps: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);
