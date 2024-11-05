const mongoose = require('mongoose');
const User = require('../model/userModel');
const Cart = require('../model/cartModel');
const Product = require('../model/productsModel');
const Category = require('../model/categoryModel');
const Order = require('../model/orderModel');
const Wishlist = require('../model/whishlist');
const Coupon = require('../model/coupon');
const Razorpay = require('razorpay');
const fs = require('fs')
const crypto = require('crypto');
const Wallet = require('../model/wallet')


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

//function to read data from Json file
const readData = () =>{
    if(fs.existsSync('orders.json')){
        const data = fs.readFileSync('orders.json');
        return JSON.parse(data);
    }
    return[];
};

// function to write data to JSON file
const writeData = (data) => {
    fs.writeFileSync('ordes.json',JSON.stringify(data,null,2));
}


const getCartDetails = async (req, res) => {
    try {
        const userId = req.session.loggedIn;

        // Fetch categories
        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        
        // Fetch cart and populate product details
        const cart = await Cart.findOne({ userId }).populate('items.productId').exec();

        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        // Calculate total price
        const totalPrice = cart.items.reduce((total, item) => {
            return total + item.quantity * (item.productId.price || 0);
        }, 0);

        // Update totalPrice in the cart document
        await Cart.findOneAndUpdate(
            { userId: userId },
            { $set: { totalPrice: totalPrice } }
        );

        console.log(cart);

        // Render shopping cart page
        res.render('user/shoping-cart.ejs', {
            cartItems: cart.items,
            totalPrice: totalPrice,
            c: category
        });
    } catch (error) {
        console.error('Error fetching cart details:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};


const addCoupon = async (req, res) => {
    const userId = req.session.loggedIn;

    try {
        const { couponCode } = req.body;

        // Check if coupon exists
        const coupon = await Coupon.findOne({ coupon_code: couponCode });
        if (!coupon) {
            return res.status(400).json({ success: false, message: 'Invalid coupon code.' });
        }

        // Fetch user cart
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found.' });
        }

        // Check if coupon is expired
        const now = new Date();
        if (coupon.end_date < now) {
            return res.status(400).json({ success: false, message: 'The coupon is expired.' });
        }

        // Check if total price meets the minimum required for the coupon
        if (cart.totalPrice < coupon.max_amount) {
            return res.status(400).json({
                success: false,
                message: `The total amount must be at least ${coupon.max_amount} to apply this coupon.`
            });
        }

        if (cart.totalPrice > coupon.max_amount+10000) {
            return res.status(400).json({
                success: false,
                message: `The total amount must be less than ${coupon.max_amount+10000} to apply this coupon.`
            });
        }
        console.log(cart.totalPrice);
        
        // Calculate discount
        const discount = Math.min(
            (cart.totalPrice * coupon.discount_percentage) / 100,
            coupon.max_amount
        );

        const newTotalPrice = cart.totalPrice - discount;


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

        const product = await Product.findById(productId);
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

        // Fetch the wishlist and cart for the user
        const wishlist = await Wishlist.findOne({ userId })
            .populate('items.productId')
            .exec();
        const cart = await Cart.findOne({ userId })
            .populate('items.productId')
            .exec();

        // Check if the wishlist exists
        if (!wishlist) {
            return res.status(404).json({ message: 'Wishlist not found' });
        }

        // Initialize an array to hold product IDs in the cart
        let cartProductIds = [];

        // Check if the cart exists and has items
        if (cart && cart.items.length > 0) {
            // Populate the cartProductIds array with product IDs from the cart
            cartProductIds = cart.items.map(cartItem => cartItem.productId.toString());
            console.log('Cart Product IDs:', cartProductIds); // Debugging line
        }

        // Filter wishlist items to remove those that are in the cart
        const updatedItems = wishlist.items.filter(wishlistItem => 
            !cartProductIds.includes(wishlistItem.productId.toString())
        );

        // Check how many items were removed
        const removedItemsCount = wishlist.items.length - updatedItems.length;
        console.log(`Removed ${removedItemsCount} items from the wishlist.`); // Debugging line

        // Update the wishlist with the filtered items
        wishlist.items = updatedItems;

        // Save the updated wishlist
        await wishlist.save();

        console.log('Updated Wishlist:', wishlist); // Debugging line

        // Render the updated wishlist
        res.render('user/wishlist.ejs', { wishlist: wishlist });
    } catch (error) {
        console.error('Error fetching wishlist:', error); // More detailed error logging
        res.status(500).send('Internal Server Error');
    }
};


const postWishlist = async (req, res) => {
    console.log("Attempting to remove item from wishlist");
    
    const { productId } = req.body;
    try {
        const wishlist = await Wishlist.updateOne(
            { 'items.productId': productId }, // Find wishlist containing the product
            { $pull: { items: { productId: productId } } } // Remove item with matching productId
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

        const product = await Product.findById(productId);
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

const checkOutget = async(req,res)=>{
  try {
    const userId = req.session.loggedIn;
    const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
    let user;

    const cart = await Cart.findOne({ userId }).populate({
        path: 'items.productId',       
        select: 'product_name price product_images' 
      })

        
    user = await User.findOne({ _id: userId  });
    if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
    }

    let subtotal = 0;
    cart.items.forEach(item => {
        subtotal += item.quantity * item.productId.price;
    });

    let discount = cart.discount;
    console.log(discount);
    

    let totalPrice = subtotal-discount;
    res.render('user/checkOut.ejs', {
        cartItems: cart.items,
        subtotal: subtotal,
        totalPrice: totalPrice,
        discount:discount,
        c:category,
        addresses: user.addresses
    });
} catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
}
}
 
// const placeOrder = async (req, res) => {
//     try {
//         const { addressId, totalAmount, discount, subtotal, paymentMethod: initialPaymentMethod, amount, currency, receipt, notes } = req.body;
//         const userId = req.session.loggedIn;

//         if (!addressId || !initialPaymentMethod || !totalAmount) {
//             return res.status(400).json({ success: false, message: 'Missing order details.' });
//         }

//         const cart = await Cart.findOne({ userId }).populate({
//             path: 'items.productId',
//             select: 'product_name price product_images'
//         });

//         if (!cart || cart.items.length === 0) {
//             return res.status(400).json({ success: false, message: 'Cart is empty.' });
//         }

//         const quantity = cart.items.length;

//         // Handling Online Payment
//         if (initialPaymentMethod === 'online payment') {
//             const options = {
//                 amount: amount * 100,
//                 currency,
//                 receipt,
//                 notes
//             };

//             try {
//                 const order = await razorpay.orders.create(options);
//                 return res.json(order);
//             } catch (error) {
//                 console.error("Error placing online payment order:", error);
//                 return res.status(500).json({ success: false, message: 'Failed to place online payment order.' });
//             }
//         }

//         // Handle Cash on Delivery
//         const paymentMethod = initialPaymentMethod === 'cashOnDelivery' ? 'Cash On Delivery' : initialPaymentMethod;

//         const newOrder = new Order({
//             userId,
//             items: cart.items.map(item => ({
//                 productId: item.productId._id,
//                 productName: item.productId.product_name,
//                 productImage: item.productId.product_images[0],
//                 quantity: item.quantity,
//                 unitPrice: item.productId.price,
//                 subtotal: item.quantity * item.productId.price
//             })),
//             shippingAddress: addressId,
//             paymentMethod,
//             totalAmount,
//             subtotal,
//             paymentStatus: 'Unpaid',
//             quantity,
//             status: 'Placed',
//             orderDate: new Date(),
//             discount
//         });

//         const savedOrder = await newOrder.save();

//         await Cart.updateOne({ userId }, { $set: { items: [] } });
//         res.json({ success: true, orderId: savedOrder._id });
//     } catch (error) {
//         console.error('Error placing order:', error);
//         res.status(500).json({ success: false, message: 'Failed to place the order. Please try again later.' });
//     }
// };





// const verifyPayment = async (req,res) => {
//     const {razorpay_order_id , razorpay_payment_id , razorpay_signature} = req.body;

//     const secret = razorpay.key_secret;
//     const body = razorpay_order_id + '|' + razorpay_payment_id;

//     try {
//         const isValidSignature = validateWebhookSignature(body , razorpay_signature , secret);
//         if(isValidSignature){
//             //update the order with paymetn details 
//             const orders = readData();
//             const order = orders.find(o => o.order_id === razorpay_order_id);
//             if(order){
//                 order.status = 'paid';
//                 writeData(orders);
//             }
//             res.status(200).json({status:'ok'});
//             console.log('payment verification seccessful');
//         }
//         else{
//             res.status(400).json({status:'verification_failed'});
//             console.log('payment verification is failed')
//         }
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({status:'error' , message:'Error verifying payment'})
//     }

// }

const orderSucsess = async(req,res)=>{
    const id = req.params.id;
    res.render('user/order-scuces.ejs',{id})
}

const orderDetails = async (req,res) => {
    const userId = req.session.loggedIn;
    const order = await Order.find({userId:userId});
    console.log(order);
    
    const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        
    res.render('user/orderHistory.ejs',{c:category, Orders:order})
}

const specificOrderDetails = async (req,res) => {
    const oId = req.params.id;    
    const userId = req.session.loggedIn;

    const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
    const orders = await Order.findOne({_id:oId});
    const aId = orders.shippingAddress;
    const result = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$addresses' },
        { $match: { 'addresses._id': new mongoose.Types.ObjectId(aId) } },
    ]); 
    const userData = result[0]; 
    const address = userData.addresses; 
    console.log(orders);
    
    res.render('user/order-details.ejs',{c:category , Items:orders.items , Orders:orders , address })
}

const orderCancel = async (req,res) => {
  
    
    try {
        const orderId = req.params.id;
       
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).send('Order not found');
        }

        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { stock: item.quantity } }, 
                { new: true }
            );
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { status: 'cancelled' }, 
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


// user wallet controller

const getWallet = async (req,res) => {
    try {
        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        res.render('user/wallet.ejs',{c:category})
    } catch (error) {
        console.log(error);
    }
    
}


const createOrder = async (userId, addressId, totalAmount, discount, paymentMethod, items, subtotal, quantity) => {
    const newOrder = new Order({
        userId,
        shippingAddress: addressId,
        paymentMethod,
        totalAmount,
        discount,
        items,
        subtotal,
        quantity,
        paymentStatus: paymentMethod === 'Cash On Delivery' ? 'Unpaid' : 'Paid',
        status: 'Placed',
        orderDate: new Date()
    });

    const savedOrder = await newOrder.save();
    await Cart.updateOne({ userId }, { $set: { items: [] } });
    return savedOrder;
};;


const createRazorpayOrder = async (req, res) => {
    console.log('razorpay crarteing is working..');
    
    try {
        const { totalAmount } = req.body;
        const options = {
            amount: totalAmount * 100,
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

const verifyPayment = async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, totalAmount, discount } = req.body;
    const userId = req.session.loggedIn;

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (isValid) {
        // Retrieve the cart items for the user to populate the quantity and subtotal
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Map cart items to order items
        const orderItems = cart.items.map((item) => ({
            productId: item.productId._id,
            productName: item.productId.product_name,
            productImage: item.productId.product_images[0], // Adjust according to your schema
            quantity: item.quantity,
            unitPrice: item.productId.price,
            subtotal: item.quantity * item.productId.price
        }));

        // Calculate the total quantity and subtotal
        const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        // Create and save the order
        const savedOrder = await createOrder(userId, addressId, totalAmount, discount, 'online payment', orderItems, subtotal, totalQuantity);
        
        res.json({ success: true, orderId: savedOrder._id });
    } else {
        res.status(400).json({ success: false, message: 'Payment verification failed.' });
    }
};



const placeOrder = async (req, res) => {
    try {
        const { addressId, totalAmount, discount, paymentMethod } = req.body;
        const userId = req.session.loggedIn;

        // Retrieve the cart items for the user
        const cart = await Cart.findOne({ userId }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Map cart items to order items
        const orderItems = cart.items.map((item) => ({
            productId: item.productId._id,
            productName: item.productId.product_name,
            productImage: item.productId.product_images[0],
            quantity: item.quantity,
            unitPrice: item.productId.price,
            subtotal: item.quantity * item.productId.price
        }));

        // Calculate the total quantity and subtotal
        const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

        // If the payment method is 'Wallet', verify balance and deduct
        if (paymentMethod === 'Wallet') {
            const userWallet = await Wallet.findOne({ userId });

            if (!userWallet || userWallet.Balance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance. Please choose another payment method.'
                });
            }

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

        // Create a new order
        const newOrder = new Order({
            userId,
            items: orderItems,
            shippingAddress: addressId,
            paymentMethod,
            totalAmount,
            discount,
            subtotal,
            quantity: totalQuantity,
            paymentStatus: paymentMethod === 'Cash On Delivery' || paymentMethod === 'Wallet' ? 'Unpaid' : 'Paid',
            status: 'Placed',
            orderDate: new Date()
        });

        const savedOrder = await newOrder.save();

        // Clear the user's cart
        await Cart.updateOne({ userId }, { $set: { items: [] } });

        res.json({ success: true, orderId: savedOrder._id });
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, message: 'Failed to place the order. Please try again later.' });
    }
};






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
    createRazorpayOrder
}