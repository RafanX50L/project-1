const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema({
    offerCode:{
        type:String,
        required:true
    },
    discount:{
        type:Number,
        required:true
    },
    apply_by:{
        type:String,
        required:true
    },
    value:{
        type:String,
        required:true
    },
    validFrom:{
        type:Date,
        required:true
    },
    validUntil:{
        type:Date,
        required:true
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
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'products' }]
},{timestamps:true});

module.exports = mongoose.model('Offers',OfferSchema)