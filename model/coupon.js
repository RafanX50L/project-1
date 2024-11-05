const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    coupon_code: {
        type: String,
        required: true,
        unique: true // Ensures the coupon code is unique
    },
    max_amount: {
        type: Number,
        required: true // Maximum discount amount
    },
    discount_percentage: {
        type: Number,
        required: true // Discount percentage
    },
    start_date: {
        type: Date,
        required: true // Date when the coupon becomes active
    },
    end_date: {
        type: Date,
        required: true // Date when the coupon expires
    },
    status: {
        type: String,
        enum: ['active', 'inactive'], // Only active and inactive statuses
        default: 'active' // Default status
    },
    is_expired: {
        type: Boolean,
        default: false // Default value for is_expired
    },
    
},{timestamps:true});

couponSchema.methods.updateExpirationStatus = function() {
    this.is_expired = this.end_date < new Date();
    return this.is_expired;
};

module.exports = mongoose.model('Coupon', couponSchema);