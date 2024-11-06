const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({  
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
