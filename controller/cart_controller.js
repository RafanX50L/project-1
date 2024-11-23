const mongoose = require('mongoose');
const User = require('../model/userModel');
const Cart = require('../model/cartModel');
const Product = require('../model/productsModel');
const Category = require('../model/categoryModel');
const Order = require('../model/orderModel');
const Wishlist = require('../model/whishlist');
const Coupon = require('../model/coupon');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../model/wallet');
const Offers = require('../model/offer'); 
const path = require('path');
const fs = require("fs");
const PDFDocument = require("pdfkit");




function verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature) {
    const secret = process.env.key_secret; 
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    
    const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    
    return generated_signature === razorpay_signature;
}



const razorpay = new Razorpay({
    key_id:process.env.key_id,
    key_secret: process.env.key_secret,
});

const readData = () =>{
    if(fs.existsSync('orders.json')){
        const data = fs.readFileSync('orders.json');
        return JSON.parse(data);
    }
    return[];
};

const writeData = (data) => {
    fs.writeFileSync('ordes.json',JSON.stringify(data,null,2));
}


const getCartDetails = async (req, res) => {
    try {
        const userId = req.session.loggedIn;

        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });

        const cart = await Cart.findOne({ userId }).populate('items.productId').exec();

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const activeOffers = await Offers.find({ status: 'active' }); 

        let cartTotalPrice = 0;
        let cartDiscount = 0;
        let quantityAdjusted = false;

        cart.items.forEach(item => {
            const product = item.productId; 

            if (item.quantity > product.stock) {
                item.quantity = product.stock;
                quantityAdjusted = true;
            }

            const productOffer = activeOffers.find(offer => offer.apply_by === 'Product' && offer.value === product.product_name);
            const subcategoryOffer = activeOffers.find(offer => offer.apply_by === 'Subcategory' && offer.value === product.sub_category);
            const categoryOffer = activeOffers.find(offer => offer.apply_by === 'Category' && offer.value === product.category);

            const applicableOffers = [productOffer, subcategoryOffer, categoryOffer].filter(Boolean);

            const bestOffer = applicableOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, { discount: 0 });

            if (bestOffer.discount > 0) {
                item.discountedPrice = product.price - (product.price * bestOffer.discount / 100);
                item.offerAmount = (product.price*item.quantity) - (item.discountedPrice*item.quantity);
                item.discount = bestOffer.discount;

                cartDiscount += item.offerAmount * item.quantity;
            } else {
                item.discount = 0;
                item.discountedPrice = product.price;
                item.offerAmount = 0;
            }

            cartTotalPrice += item.discountedPrice * item.quantity;
        });

        if (quantityAdjusted) {
            await cart.save();
        }
        res.render('user/shoping-cart.ejs', {
            cartItems: cart.items,
            totalPrice: cartTotalPrice,
            cartDiscount: cartDiscount,
            c: category
        });
    } catch (error) {
        console.error('Error fetching cart details:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};



const addCoupon = async (req, res) => {
    const userId = req.session.loggedIn;

    console.log('entered to add coupon');
    
    try {
        const { couponCode, totalPrice} = req.body;

        const coupon = await Coupon.findOne({ coupon_code: couponCode });
        if (!coupon) {
            return res.status(400).json({ success: false, message: 'Invalid coupon code.' });
        }

        

        const now = new Date();
        if (coupon.end_date < now) {
            return res.status(400).json({ success: false, message: 'The coupon is expired.' });
        }

        if (totalPrice < coupon.max_amount) {
            return res.status(400).json({
                success: false,
                message: `The total amount must be at least ${coupon.max_amount} to apply this coupon.`
            });
        }

        if (totalPrice > coupon.max_amount+10000) {
            return res.status(400).json({
                success: false,
                message: `The total amount must be less than ${coupon.max_amount+10000} to apply this coupon.`
            });
        }
        console.log(totalPrice);
        
        const discount = Math.min(
            (totalPrice * coupon.discount_percentage) / 100,
            coupon.max_amount
        );

        const newTotalPrice = totalPrice - discount;
        console.log(newTotalPrice,discount);
        


        res.json({
            success: true,
            message: `Coupon applied! You've saved ${discount}.`,
            discountAmount: discount,
            newTotalPrice
        });

    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({ success: false, message: 'Failed to apply coupon. Please try again later.' });
    }
};


const addToCart = async (req, res) => {
    const { productId } = req.body;
    let sessionId = req.session.loggedIn ;  

    try {

        let user = await User.findOne({ _id: sessionId });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const product = await Product.findOne({ _id: productId, status: true, stock: { $gt: 0 } });
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        let cart = await Cart.findOne({ userId: user._id });
        if (!cart) {
            cart = new Cart({ userId: user._id, items: [] });
        }
        
    

        const existingProductIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        
        if (existingProductIndex !== -1) {
            return res.status(404).json({ success: false, message: 'Product already in Cart' ,title : 'Already in Cart' });
        } else {
            cart.items.push({
                productId: productId,
                quantity: 1
            });
        }

        await cart.save();

        res.json({ success: true, message: 'Product added to cart' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error adding product to cart' });
    }
};

const getWishlist = async (req, res) => {
    try {
        const userId = req.session.loggedIn;

        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        const wishlist = await Wishlist.findOne({ userId })
            .populate('items.productId')
            .exec();
        const cart = await Cart.findOne({ userId })
            .populate('items.productId')
            .exec();

        if (!wishlist) {
            return res.status(404).json({ message: 'Wishlist not found' });
        }

        let cartProductIds = [];

        if (cart && cart.items.length > 0) {
            cartProductIds = cart.items.map(cartItem => cartItem.productId.toString());
        }

        const updatedItems = wishlist.items.filter(wishlistItem => 
            !cartProductIds.includes(wishlistItem.productId.toString())
        );

        const removedItemsCount = wishlist.items.length - updatedItems.length;
   
        wishlist.items = updatedItems;

        await wishlist.save();


        res.render('user/wishlist.ejs', { wishlist: wishlist , c:category });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).send('Internal Server Error');
    }
};


const postWishlist = async (req, res) => {
    console.log("Attempting to remove item from wishlist");
    
    const { productId } = req.body;
    try {
        const wishlist = await Wishlist.updateOne(
            { 'items.productId': productId }, 
            { $pull: { items: { productId: productId } } } 
        );

        if (wishlist.modifiedCount === 0) {
            return res.status(404).json({ message: 'Item not found in wishlist' });
        }

        console.log("Item removed successfully");
        res.json({ success: true, message: 'Product removed from wishlist' });
    } catch (error) {
        console.log("Error removing item from wishlist:", error);
        res.status(500).send('Internal Server Error');
    }
};




const addToWishList = async (req, res) => {
    const { productId } = req.body;
    let sessionId = req.session.loggedIn;

    try {
        let user = await User.findOne({ _id: sessionId });
        const check = await Cart.findOne({'items.productId':productId})
        if(check){
            return res.status(404).json({ success: false, message: 'Product already in cart', title :'Already in Cart' });
        }
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const product = await Product.findOne({ _id:  productId, status: true, stock: { $gt: 0 } });
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        let wishlist = await Wishlist.findOne({ userId: user._id });
        if (!wishlist) {
            wishlist = new Wishlist({ userId: sessionId, items: [] });
        }

        const existingProductIndex = wishlist.items.findIndex(
            item => item.productId.toString() === productId
        );

        if (existingProductIndex !== -1) {
            return res.status(404).json({ success: false, message: 'Product already in wishlist', title:'Already in wishlist' });

        } else {
            wishlist.items.push({ productId: productId });
        }

        await wishlist.save();
        res.json({ success: true, message: 'Product added to wishlist' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error adding product to wishlist' });
    }
};


const removeFromCart = async (req, res) => {
    console.log("fafdfuisafh");
    
  try {
    const userId = req.session.loggedIn; 
    const productId = new mongoose.Types.ObjectId(req.params.productId); 


    if (!productId) {
      console.log('Product not found');
      return res.status(400).json({ error: 'Product ID is missing' });
    }

    const updatedCart = await Cart.findOneAndUpdate(
      { userId: userId },
      { $pull: { items: { productId: productId } } }, 
      { new: true } 
    );

    if (!updatedCart) {
      console.log('Updated cart not found');
      return res.status(404).json({ error: 'Cart not found or product not in cart' });
    }

    console.log('Product successfully removed');
    res.status(200).json({ success: true, message: 'Product removed from cart', cart: updatedCart });
  } catch (error) {
    console.error('Error in removeFromCart:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updatCart = async (req,res) => {
  try {
    const userId = req.session.loggedIn; 
    const { items } = req.body; 

    const cart = await Cart.findOneAndUpdate(
        { userId },
        { $set: { 'items.$[elem].quantity': 1 } }, 
        { arrayFilters: [{ 'elem.productId': { $in: items.map(item => item.productId) } }] } 
    );

    for (const item of items) {
        await Cart.updateOne(
            { userId, 'items.productId': item.productId },
            { $set: { 'items.$.quantity': item.quantity } }
        );
    }

    res.json({ message: 'Cart updated successfully!' });
} catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
}
}

const checkOutget = async (req, res) => {
    try {
        const userId = req.session.loggedIn;

        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        const cart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                match: { stock: { $gte: 1 } ,status:true}
            })
            .exec();

        const user = await User.findOne({ _id: userId });

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const activeOffers = await Offers.find({ status: 'active' });

        let subtotal = 0;
        let offerDiscount = 0;

        const availableItems = cart.items.filter(item => item.productId && item.productId.stock >= 1);

        availableItems.forEach(item => {
            const product = item.productId;

            const productOffer = activeOffers.find(offer => offer.apply_by === 'Product' && offer.value === product.product_name);
            const subcategoryOffer = activeOffers.find(offer => offer.apply_by === 'Subcategory' && offer.value === product.sub_category);
            const categoryOffer = activeOffers.find(offer => offer.apply_by === 'Category' && offer.value === product.category);

            const applicableOffers = [productOffer, subcategoryOffer, categoryOffer].filter(Boolean);
            const bestOffer = applicableOffers.reduce((max, offer) => (offer.discount > max.discount ? offer : max), { discount: 0 });

            if (bestOffer.discount > 0) {
                item.offerPrice = product.price - (product.price * bestOffer.discount / 100);
                item.offerAmount = (product.price * item.quantity) - (item.offerPrice * item.quantity);
                item.discount = bestOffer.discount;

                offerDiscount += item.offerAmount;
            } else {
                item.offerPrice = product.price;
                item.offerAmount = 0;
                item.discount = 0;
            }

            subtotal += product.price * item.quantity;
        });
        let deliveryCharge = subtotal*0.08;

        const totalPrice = (subtotal - offerDiscount)+deliveryCharge;

        res.render('user/checkOut.ejs', {
            cartItems: availableItems,
            subtotal: subtotal.toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            offerDiscount: offerDiscount.toFixed(2),
            couponDiscount: 0, 
            c: category,
            deliveryCharge:deliveryCharge,
            addresses: user.addresses
        });
    } catch (error) {
        console.error('Error in checkout:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const validateCart = async (req,res) => {
    console.log('entered to validate cart');
    
    try {
        const userId = req.session.loggedIn; 
        const cart = await Cart.findOne({ userId }).populate('items.productId'); 

        const outOfStockOrUnlisted = cart.items.filter(item => {
            const product = item.productId;
            return !product.status==true || product.stock < item.quantity;
        });

        if (outOfStockOrUnlisted.length > 0) {
            console.log('found unlisted products ');
            
            cart.items = cart.items.filter(item => {
                const product = item.productId;
                return product.status && product.stock >= item.quantity; // Keep only valid items
            });
    
            // Save the updated cart
            await cart.save();

            return res.status(400).json({
                message: 'Some products are out of stock or no longer available.',
                issues: outOfStockOrUnlisted
            });
        }

        res.json({ message: 'All products are available.' });
    } catch (error) {
        res.status(500).json({ message: 'Error validating cart.', error });
    }
}

const orderSucsess = async(req,res)=>{
    const id = req.params.id;
    res.render('user/order-scuces.ejs',{id})
}

const orderDetails = async (req,res) => {
    const userId = req.session.loggedIn;
    const order = await Order.find({userId:userId});

    
    const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        
    res.render('user/orderHistory.ejs',{c:category, Orders:order})
}

const specificOrderDetails = async (req,res) => {
    const oId = req.params.id;    
    const userId = req.session.loggedIn;

    const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
    const orders = await Order.findOne({_id:oId});
    console.log(orders.userId);
    if(userId==orders.userId){
        res.render('user/order-details.ejs',{c:category , Items:orders.items , Orders:orders  })
    }else{
        req.session.security=true;
        res.redirect('/user/alert');
    }
   
    
}

const orderCancel = async (req,res) => {
    const userId = req.session.loggedIn;
    
    try {
        const orderId = req.params.id;
       
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).send('Order not found');
        }

        

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { status: 'cancelled' }, 
            { new: true } 
        );

        
        
        if (!updatedOrder) {
            return res.status(404).send('Order not found');
        }

        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { stock: item.quantity } }, 
                { new: true }
            );
        }

        if(order.paymentMethod === 'Wallet' || order.paymentMethod === 'online payment'){
            let userWallet = await Wallet.findOne({ userId:userId });

            if (!userWallet) {
                userWallet = new Wallet({
                    userId: userId,
                    Balance: 0,
                    orderId:'',
                    transactions: []
                });
            }

            userWallet.Balance += order.totalAmount;

            userWallet.Transaction.push({
                amount: order.totalAmount,
                date: new Date(),
                type: 'credit',
                orderId:order.orderId,
                reason: 'Order Cancelled'
            });

            await userWallet.save();
            console.log('Wallet refund successful');
        }
        res.status(200).json({ message: 'Order canceled successfully', order: updatedOrder });
    } catch (error) {
        res.status(500).send('Server error: ' + error.message);
    }
}
const orderReturn = async (req,res) => {
    const userId = req.session.loggedIn;
    
    try {
        const orderId = req.params.id;
       
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).send('Order not found');
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { returnStatus: 'requested' }, 
            { new: true } 
        );

        if (!updatedOrder) {
            return res.status(404).send('Order not found');
        }
        res.status(200).json({ message: 'Order canceled successfully', order: updatedOrder });
    } catch (error) {
        res.status(500).send('Server error: ' + error.message);
    }
}


const getWallet = async (req,res) => {
    const userId = req.session.loggedIn;
    try {
        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        const wallet = await Wallet.findOne({userId:userId});
        res.render('user/wallet.ejs',{c:category , wallet:wallet})
    } catch (error) {
        console.log(error);
    }
    
}


const createOrder = async ({ userId, addressId, totalAmount, discount, offerDiscount, paymentMethod, items, subtotal, quantity , deliveryCharge }) => {
    console.log('entered to create order');
    const user = await User.findOne(
        { 
          _id: userId,
          "addresses._id": addressId  
        },
        { 
          "addresses.$": 1  
        }
    );

    if (!user) {
        throw new Error('User or address not found');
    }

    const shippingAddress = user.addresses[0];

    const newOrder = new Order({
        userId,
        shippingAddress,
        paymentMethod,
        totalAmount,
        Coupon_discount: discount,
        Offer_discount: offerDiscount,
        deliveryCharge:deliveryCharge,
        items,
        subtotal,
        quantity,
        paymentStatus: paymentMethod === 'Cash On Delivery' ? 'Unpaid' : 'Paid',
        status: 'Placed',
        orderDate: new Date()
    });

    const savedOrder = await newOrder.save();
    for (const item of items) {
        await Product.updateOne(
            { _id: item.productId },
            { $inc: { stock: -item.quantity } }
        );
    }
    await Cart.updateOne({ userId }, { $set: { items: [] } });
    return savedOrder; 
};



const createRazorpayOrder = async (req, res) => {
    console.log('razorpay crarteing is working..');
    const { totalAmount } = req.body;
    const amountInPaise = Math.round(totalAmount * 100);
    try {
        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: 'receipt#1',
            notes: {}
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error("Error creating Razorpay order:", error);
        res.status(500).json({ success: false, message: 'Failed to create Razorpay order.' });
    }
};


const retryPayment = async (req,res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature,orderId} = req.body;
        const userId = req.session.loggedIn;

        console.log('orderId '+orderId);
        
        const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
        if (isValid) {
            const order = await Order.findByIdAndUpdate(
                orderId,
                { status: 'placed', paymentStatus: 'paid' },
                { new: true } 
            );
            if(!order){

                res.json({ success: false });
            }
            else{
                res.json({success:true})
            }

        }
        else{
            res.json({success:false})
        }
    } catch (error) {
        console.log(error);
    }
}

const verifyPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, totalAmount, discount, offerDiscount ,deliveryCharge } = req.body;
    const userId = req.session.loggedIn;

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (isValid) {
        const cart = await Cart.findOne({ userId })
        .populate({
            path: 'items.productId',
            match: { stock: { $gte: 1 } ,status:true}
        })
        .exec();

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const activeOffers = await Offers.find({ status: 'active' });

        // Filter only items with stock >= 1
        const orderItems = cart.items
            .filter(item => item.productId && item.productId.stock >= 1 && item.productId.status == true)
            .map(item => {
                const product = item.productId;

                const productOffer = activeOffers.find(offer => offer.apply_by === 'Product' && offer.value === product.product_name);
                const subcategoryOffer = activeOffers.find(offer => offer.apply_by === 'Subcategory' && offer.value === product.sub_category);
                const categoryOffer = activeOffers.find(offer => offer.apply_by === 'Category' && offer.value === product.category);

                const applicableOffers = [productOffer, subcategoryOffer, categoryOffer].filter(Boolean);
                const bestOffer = applicableOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, { discount: 0 });

                const offerPrice = bestOffer.discount > 0 
                    ? product.price - (product.price * bestOffer.discount / 100)
                    : product.price;

                const offerAmount = (product.price - offerPrice) * item.quantity;

                return {
                    productId: product._id,
                    productName: product.product_name,
                    productImage: product.product_images[0], 
                    quantity: item.quantity,
                    unitPrice: product.price,
                    offerPrice: offerPrice,                    
                    subtotal: product.price * item.quantity,
                    offerAmount: offerAmount
                };
            });

        const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        const savedOrder = await createOrder({
            userId,
            addressId,
            totalAmount,
            discount,
            offerDiscount,
            deliveryCharge:deliveryCharge,
            paymentMethod: 'online payment',
            items: orderItems,
            subtotal,
            quantity: totalQuantity
        });
        
        res.json({ success: true, orderId: savedOrder._id });
    } else {
        console.log('entered to erroe of order');
        
        const cart = await Cart.findOne({ userId })
        .populate({
            path: 'items.productId',
            match: { stock: { $gte: 1 } ,status:true}
        })
        .exec();

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const activeOffers = await Offers.find({ status: 'active' });

        // Filter only items with stock >= 1
        const orderItems = cart.items
            .filter(item => item.productId && item.productId.stock >= 1 && item.productId.status == true)
            .map(item => {
                const product = item.productId;

                const productOffer = activeOffers.find(offer => offer.apply_by === 'Product' && offer.value === product.product_name);
                const subcategoryOffer = activeOffers.find(offer => offer.apply_by === 'Subcategory' && offer.value === product.sub_category);
                const categoryOffer = activeOffers.find(offer => offer.apply_by === 'Category' && offer.value === product.category);

                const applicableOffers = [productOffer, subcategoryOffer, categoryOffer].filter(Boolean);
                const bestOffer = applicableOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, { discount: 0 });

                const offerPrice = bestOffer.discount > 0 
                    ? product.price - (product.price * bestOffer.discount / 100)
                    : product.price;

                const offerAmount = (product.price - offerPrice) * item.quantity;

                return {
                    productId: product._id,
                    productName: product.product_name,
                    productImage: product.product_images[0], 
                    quantity: item.quantity,
                    unitPrice: product.price,
                    offerPrice: offerPrice,                    
                    subtotal: product.price * item.quantity,
                    offerAmount: offerAmount
                };
            });

        const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        const user = await User.findOne(
            { 
              _id: userId,
              "addresses._id": addressId  
            },
            { 
              "addresses.$": 1  
            }
        );
    
        if (!user) {
            throw new Error('User or address not found');
        }
    
        const shippingAddress = user.addresses[0];

        const newOrder = new Order({
            userId,
            shippingAddress,
            totalAmount,
            Coupon_discount: discount,
            Offer_discount: offerDiscount,
            deliveryCharge:deliveryCharge,
            paymentMethod: 'online payment',
            items: orderItems,
            subtotal,
            quantity: totalQuantity,
            paymentStatus: 'Unpaid',
            status: 'Payment pending',
            orderDate: new Date()
        });
        
    
        const savedOrder = await newOrder.save();

        for (const item of orderItems) {
            await Product.updateOne(
                { _id: item.productId },
                { $inc: { stock: -item.quantity } }
            );
        }
        await Cart.updateOne({ userId }, { $set: { items: [] } });
        res.status(400).json({ success: true,orderId: savedOrder._id });
    }
};

const saveFailedOrder = async (req,res) => {
    console.log('entere to backend to save failed order');
    
    const userId = req.session.loggedIn;
    try {
        const { razorpay_order_id, razorpay_payment_id, paymentStatus, errorMessage , addressId, totalAmount, discount, offerDiscount, deliveryCharge} = req.body;
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const activeOffers = await Offers.find({ status: 'active' });

        // Filter only items with stock >= 1
        const orderItems = cart.items
            .filter(item => item.productId && item.productId.stock >= 1 && item.productId.status == true)
            .map(item => {
                const product = item.productId;

                const productOffer = activeOffers.find(offer => offer.apply_by === 'Product' && offer.value === product.product_name);
                const subcategoryOffer = activeOffers.find(offer => offer.apply_by === 'Subcategory' && offer.value === product.sub_category);
                const categoryOffer = activeOffers.find(offer => offer.apply_by === 'Category' && offer.value === product.category);

                const applicableOffers = [productOffer, subcategoryOffer, categoryOffer].filter(Boolean);
                const bestOffer = applicableOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, { discount: 0 });

                const offerPrice = bestOffer.discount > 0 
                    ? product.price - (product.price * bestOffer.discount / 100)
                    : product.price;

                const offerAmount = (product.price - offerPrice) * item.quantity;

                return {
                    productId: product._id,
                    productName: product.product_name,
                    productImage: product.product_images[0], 
                    quantity: item.quantity,
                    unitPrice: product.price,
                    offerPrice: offerPrice,                    
                    subtotal: product.price * item.quantity,
                    offerAmount: offerAmount
                };
            });
            const user = await User.findOne(
                { 
                  _id: userId,
                  "addresses._id": addressId  
                },
                { 
                  "addresses.$": 1  
                }
            );

            const shippingAddress = user.addresses[0];

        const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        const newOrder = new Order({
            userId,
            shippingAddress: shippingAddress,
            totalAmount,
            Coupon_discount: discount,
            Offer_discount: offerDiscount,
            deliveryCharge:deliveryCharge,
            paymentMethod: 'online payment',
            items: orderItems,
            subtotal,
            quantity: totalQuantity,
            paymentStatus: 'Unpaid',
            status: 'Payment pending',
            orderDate: new Date()
        });
        
    
        const savedOrder = await newOrder.save();
        await Cart.updateOne({ userId }, { $set: { items: [] } });
        res.status(200).json({ success: true, orderId: savedOrder._id });

    } catch (error) {
        console.log(error);
    }
}

const placeOrder = async (req, res) => {
    try {
        const { addressId, totalAmount, discount, paymentMethod, offerDiscount ,deliveryCharge } = req.body;
        const userId = req.session.loggedIn;

        const cart = await Cart.findOne({ userId })
        .populate({
            path: 'items.productId',
            match: { stock: { $gte: 1 } ,status:true}
        })
        .exec();


        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const activeOffers = await Offers.find({ status: 'active' });

        // Filter only items with stock >= 1
        const orderItems = cart.items
            .filter(item => item.productId && item.productId.stock >= 1 && item.productId.status == true)
            .map(item => {
                const product = item.productId;

                const productOffer = activeOffers.find(offer => offer.apply_by === 'Product' && offer.value === product.product_name);
                const subcategoryOffer = activeOffers.find(offer => offer.apply_by === 'Subcategory' && offer.value === product.sub_category);
                const categoryOffer = activeOffers.find(offer => offer.apply_by === 'Category' && offer.value === product.category);

                const applicableOffers = [productOffer, subcategoryOffer, categoryOffer].filter(Boolean);
                const bestOffer = applicableOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max, { discount: 0 });

                const offerPrice = bestOffer.discount > 0
                    ? product.price - (product.price * bestOffer.discount / 100)
                    : product.price;

                const subtotal = product.price;

                return {
                    productId: product._id,
                    productName: product.product_name,
                    productImage: product.product_images[0],
                    quantity: item.quantity,
                    unitPrice: product.price,
                    offerPrice: offerPrice,
                    subtotal: subtotal
                };
            });

        const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = orderItems.reduce((sum, item) => sum + (item.subtotal*item.quantity), 0);

        const user = await User.findOne(
            { 
              _id: userId,
              "addresses._id": addressId  
            },
            { 
              "addresses.$": 1  
            }
        );
    
        if (!user) {
            throw new Error('User or address not found');
        }
    
        const shippingAddress = user.addresses[0];

        const newOrder = new Order({
            userId,
            items: orderItems,
            shippingAddress,
            paymentMethod,
            totalAmount,
            Coupon_discount: discount,
            Offer_discount: offerDiscount,
            deliveryCharge:deliveryCharge,
            subtotal,
            quantity: totalQuantity,
            paymentStatus: paymentMethod === 'Cash On Delivery' ? 'Unpaid' : 'Paid',
            status: 'Placed',
            orderDate: new Date()
        });
        if (paymentMethod === 'Wallet') {
            const userWallet = await Wallet.findOne({ userId });

            if (!userWallet || userWallet.Balance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance. Please choose another payment method.'
                });
            }

            // Deduct the amount from the wallet
            userWallet.Balance -= totalAmount;
            userWallet.Transaction = userWallet.Transaction || [];
            userWallet.Transaction.push({
                amount: totalAmount,
                date: new Date(),
                type: 'Debit',
                reason: 'Order Payment'
            });
            await userWallet.save();
        }

        const savedOrder = await newOrder.save();

        if (paymentMethod === 'Wallet') {
            const userWallet = await Wallet.findOne({ userId });
            userWallet.Transaction[userWallet.Transaction.length - 1].orderId = savedOrder._id;
            await userWallet.save();
        }

        for (const item of orderItems) {
            await Product.updateOne(
                { _id: item.productId },
                { $inc: { stock: -item.quantity } }
            );
        }

        await Cart.updateOne({ userId }, { $set: { items: [] } });

        res.json({ success: true, orderId: savedOrder._id });
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, message: 'Failed to place the order. Please try again later.' });
    }
};

const invoice = async (req, res) => {
    try {
        const userId = req.session.loggedIn;
        const { orderId } = req.query;

        const order = await Order.findById(orderId)
            .populate({
                path: 'userId',
                populate: { path: 'addresses' }
            })
            .exec();


        if (!order) {
            return res.status(404).send("Order or Address not found.");
        }

        console.log(order);
        
        
        const invoice = {
            shipping: {
                name: order.shippingAddress.name,
                address: order.shippingAddress.houseNumber,
                city: order.shippingAddress.city,
                state: order.shippingAddress.state,
                country:order.shippingAddress.country,
                postal_code: order.shippingAddress.zip
            },
            items: order.items.map(item => ({
                item: item.productName,
                description: item.productName,
                quantity: item.quantity,
                amount: item.unitPrice
            })),
            subtotal: order.subtotal,
            paid: order.totalAmount || 0,
            offerAmount:order.Offer_discount,
            discountAmount:order.Coupon_discount,
            deliveryCharge:order.deliveryCharge,
            invoice_nr: order.orderId || 1234
        };

        const filename = `invoice_${orderId}.pdf`;
        const filepath = path.join(__dirname, filename);

        createInvoice(invoice, filepath, (err) => {
            if (err) {
                console.error("Error generating PDF:", err);
                return res.status(500).send("Error generating invoice PDF");
            }

            res.download(filepath, filename, (downloadErr) => {
                if (downloadErr) {
                    console.error("Error downloading file:", downloadErr);
                    res.status(500).send("Error downloading invoice");
                }

                fs.unlink(filepath, (unlinkErr) => {
                    if (unlinkErr) console.error("Error deleting file:", unlinkErr);
                });
            });
        });
    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).send("Error generating invoice");
    }
};







function createInvoice(invoice, path, callback) {
    let doc = new PDFDocument({ size: "A4", margin: 50 });

    generateHeader(doc);
    generateCustomerInformation(doc, invoice);
    generateInvoiceTable(doc, invoice);
    generateFooter(doc);

    doc.end();
    doc.pipe(fs.createWriteStream(path))
        .on("finish", callback)  
        .on("error", (err) => callback(err));  
}

    function generateHeader(doc) {
    doc
        .image("logo.png", 50, 45, { width: 50 })
        .fillColor("#444444")
        .fontSize(20)
        .fontSize(10)
        .text("Bankai.com", 200, 50, { align: "right" })
        .text("123 Main Street", 200, 65, { align: "right" })
        .text("New York, NY, 10025", 200, 80, { align: "right" })
        .moveDown();
    }

    function generateCustomerInformation(doc, invoice) {
    doc
        .fillColor("#444444")
        .fontSize(20)
        .text("Invoice", 50, 160);

    generateHr(doc, 185);

    const customerInformationTop = 200;

    doc
        .fontSize(10)
        .text("Invoice Number:", 50, customerInformationTop)
        .font("Helvetica-Bold")
        .text(invoice.invoice_nr, 150, customerInformationTop)
        .font("Helvetica")
        .text("Invoice Date:", 50, customerInformationTop + 15)
        .text(formatDate(new Date()), 150, customerInformationTop + 15)
        .text("Total Price:", 50, customerInformationTop + 30)
        .text(
        formatCurrency(invoice.paid),
        150,
        customerInformationTop + 30
        )

        .font("Helvetica-Bold")
        .text(invoice.shipping.name, 300, customerInformationTop)
        .font("Helvetica")
        .text(invoice.shipping.address, 300, customerInformationTop + 15)
        .text(
        invoice.shipping.city +
            ", " +
            invoice.shipping.state +
            ", " +
            invoice.shipping.country,
        300,
        customerInformationTop + 30
        )
        .moveDown();

    generateHr(doc, 252);
    }

    function generateInvoiceTable(doc, invoice) {
    let i;
    const invoiceTableTop = 330;

    doc.font("Helvetica-Bold");
    generateTableRow(
        doc,
        invoiceTableTop,
        "Item",
        "Unit Cost",
        "Quantity",
        "Line Total"
    );
    generateHr(doc, invoiceTableTop + 20);
    doc.font("Helvetica");

    for (i = 0; i < invoice.items.length; i++) {
        const item = invoice.items[i];
        const position = invoiceTableTop + (i + 1) * 30;
        generateTableRow(
        doc,
        position,
        item.item,
        item.description,
        formatCurrency(item.amount / item.quantity),
        item.quantity,
        formatCurrency(item.amount)
        );

        generateHr(doc, position + 20);
    }

    const subtotalPosition = invoiceTableTop + (i + 1) * 30;
    generateTableRow(
        doc,
        subtotalPosition,
        "",
        "",
        "Subtotal",
        "",
        formatCurrency(invoice.subtotal)
    );

    const paidToDatePosition = subtotalPosition + 20;
    generateTableRow(
        doc,
        paidToDatePosition,
        "",
        "",
        "Offer Amount",
        "",
        formatCurrency(invoice.offerAmount)
    );

    const discountpositon = paidToDatePosition + 20;
    generateTableRow(
        doc,
        discountpositon,
        "",
        "",
        "Coupon Discount",
        "",
        formatCurrency(invoice.discountAmount)
    );

    const deliveryChargepositon = discountpositon + 20;
    generateTableRow(
        doc,
        deliveryChargepositon,
        "",
        "",
        "Delivery Charge",
        "",
        formatCurrency(invoice.deliveryCharge)
    );

    const duePosition = deliveryChargepositon + 25;
    doc.font("Helvetica-Bold");
    generateTableRow(
        doc,
        duePosition,
        "",
        "",
        "Total Price",
        "",
        formatCurrency(invoice.paid)
    );
    doc.font("Helvetica");
    }

    function generateFooter(doc) {
    doc
        .fontSize(10)
        .text(
        "Payment is due within 15 days. Thank you for your business.",
        50,
        780,
        { align: "center", width: 500 }
        );
    }

    function generateTableRow(
    doc,
    y,
    item,
    description,
    unitCost,
    quantity,
    lineTotal
    ) {
    doc
        .fontSize(10)
        .text(item, 50, y)
        .text(unitCost, 280, y, { width: 90, align: "right" })
        .text(quantity, 370, y, { width: 90, align: "right" })
        .text(lineTotal, 0, y, { align: "right" });
    }

    function generateHr(doc, y) {
    doc
        .strokeColor("#aaaaaa")
        .lineWidth(1)
        .moveTo(50, y)
        .lineTo(550, y)
        .stroke();
    }

    function formatCurrency(cents) {
    return "Rs " + (cents ).toFixed(2);
    }

    function formatDate(date) {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return year + "/" + month + "/" + day;
    }



module.exports = { 
    addToCart,
    getCartDetails,
    removeFromCart,
    updatCart,
    checkOutget,
    placeOrder,
    orderSucsess,
    orderDetails,
    specificOrderDetails,
    orderCancel,
    addToWishList,
    getWishlist,
    postWishlist,
    addCoupon,
    getWallet,
    verifyPayment,
    createRazorpayOrder,
    orderReturn,
    saveFailedOrder,
    retryPayment,
    invoice,
    validateCart
}