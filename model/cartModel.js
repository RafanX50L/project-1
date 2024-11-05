const mongoose = require('mongoose');
const { type } = require('os');

const cartSchema = new mongoose.Schema({
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
            },
            quantity: {
                type: Number,
                required: true,
                default: 1,
            }
        }
    ],
    totalPrice: {
        type: Number,
        required: true,
        default: 0,
    },
    discount:{
        type:String,
        default:0
    }
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
