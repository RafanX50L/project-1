const mongoose = require('mongoose');
const { type } = require('os');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Products', 
    required: true,
  },
  productName: {
    type: String,
    required: true,
  },
  productImage: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  unitPrice: {
    type: Number,
    required: true,
  },
  offerPrice:{
    type:Number,
    default:0
  },
  subtotal: {
    type: Number,
    required: true,
  }
});
const AddressSchema = new mongoose.Schema({
  name: { type: String,
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
    required: true 
  },
  phone: { 
    type: String, 
    required: true 
  },
}, { _id: false }); 

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user', 
    required: true,
  },
  items: [orderItemSchema], 
  shippingAddress: {
    type: AddressSchema,
    required: true,  // Make it required, meaning the user must have one shipping address
  },
  paymentMethod: {
    type: String,
    enum: ['Wallet', 'Cash On Delivery','online payment'],
    required: true,
  },
  totalAmount: {
    type: Number,
    
  },
  subtotal:{
    type:Number,
    required:true
  },
  quantity: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled' , 'Returned','Payment pending'],
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Unpaid'],
    required: true,
  },
  orderDate: {
    type: Date,
    default: Date.now,
  }, 
  deliveryDate: {
    type: Date, 
  },
  Coupon_discount:{
    type:Number,
    default:0
  },
  returnStatus:{
    type:String,
    enum:['requested' , 'approved' , 'rejected']
  },
  Offer_discount:{
    type:Number,
    default:0
  },
  deliveryCharge:{
    type:Number,
    default:0
  }
}, { timestamps: true });

orderSchema.pre('save', async function(next) {
    if (!this.isNew) return next(); 

    try {
        const count = await this.model('Order').countDocuments(); 
        const orderNumber = (count + 1).toString().padStart(5, '0'); 
        this.orderId = `ODI ${orderNumber}`; 
        next();
    } catch (error) {
        next(error);
    }
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
