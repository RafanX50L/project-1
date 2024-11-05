const mongoose = require('mongoose');
const { type } = require('os');

const user_signupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    password: {
        type: String
    },
    email: {
        type: String,
        required: true
    },
    isblocked: {
        type: Boolean,
        default: false
    },
    verify: {
        type: Boolean,
        default: false
    },
    otp: {
        type: Number
    },
    dob: {
        type: String
    },
    phone: {
        type: String
    },
    gid: {
        type: String
    },
    addresses: [{
        name: {
            type: String,
            required: true
        },
        houseNumber: {
            type: String,
            required: true
        },
        street: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        zip: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true,
            default: "India" 
        },
        phone: {
            type: String,
            required: true
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model('user', user_signupSchema);
