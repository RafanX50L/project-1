const mongoose = require('mongoose');
const { type } = require('os');

const WalletSchema = new mongoose.Schema({

    userId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    Balance :{
        type:Number,
        default:0
    },
    Transaction:[
        {
            amount:{
                type:Number,
                required:true
            },
            date:{
                type:Date,
                default:Date.now,
            },
            type:{
                type:String,
                enum:["credit","Debit"],
                required:true
            },
            orderId:{
                type:String,
                required:true
            },
            reason:{
                type:String
            }
        }
    ]

},{timestamps:true})

module.exports = mongoose.model('Wallet',WalletSchema);
