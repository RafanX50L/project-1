const mongoose = require('mongoose');
const product_Schema = new mongoose.Schema({
    product_name:{
        type:String,
        required:true
    },
    category:{
        type:String,
        required:true
    },
    sub_category:{
        type:String,
        required:true
    },
    price:{
        type:Number, 
        required:true
    },
    stock:{
        type:Number,
        required:true
    },
    status:{
        type:Boolean,
        default:true
    },
    description:{
        type:String
    },
    product_images:[{
        type:String,
        required:true
    }]
},{timestamps:true})

module.exports = mongoose.model('products',product_Schema);