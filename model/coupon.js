const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    coupon_code: {
        type: String,
        required: true,
        unique: true 
    },
    max_amount: {
        type: Number,
        required: true 
    },
    discount_percentage: {
        type: Number,
        required: true 
    },
    start_date: {
        type: Date,
        required: true 
    },
    end_date: {
        type: Date,
        required: true 
    },
    status: {
        type: String,
        enum: ['active', 'inactive'], 
        default: 'active' 
    },
    is_expired: {
        type: Boolean,
        default: false 
    },
    
},{timestamps:true});

couponSchema.methods.updateExpirationStatus = function() {
    this.is_expired = this.end_date < new Date();
    return this.is_expired;
};

module.exports = mongoose.model('Coupon', couponSchema);