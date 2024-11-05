const mongoose = require('mongoose');

const user_signupSchema = new mongoose.Schema({
    email:{
        type:String,
        required:true
    },
    password:{
        type:String
    }
    

},{timestamps:true})

module.exports = mongoose.model('admin',user_signupSchema);