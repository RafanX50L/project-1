const mongoose = require('mongoose');

const admin_signupSchema = new mongoose.Schema({
    email:{
        type:String,
        required:true
    },
    password:{
        type:String
    }
    

},{timestamps:true})

module.exports = mongoose.model('admin',admin_signupSchema);