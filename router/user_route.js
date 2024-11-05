const express = require('express');
const user_route = express.Router();
const user_Controller = require('../controller/user_controller');
const google_contrller = require('../controller/google_authentication');
const cart_Controller = require('../controller/cart_controller');
const passport = require('passport');
require('../public/js/passport');
const User = require('../model/userModel');
const Razorpay = require('razorpay');
const fs = require('fs');

user_route.use(express.static('public'));
user_route.use(passport.initialize());
user_route.use(passport.session());

user_route.use(async (req, res, next) => {
    const publicPaths = ['/login', '/signup','/resend-otp', '/otp-validation', '/logout' , '/auth/google' , '/auth/google/callback','/success','/','/failure'];

    if (publicPaths.includes(req.path)) {
        return next();
    }

    if (req.session.loggedIn) {
        try {
            const user = await User.findOne({ _id: req.session.loggedIn }); 
    
            if (user && user.isblocked === false && user.verify === true) {
                return next();
            } else {
                req.session.destroy(() => {
                    res.redirect('/');
                });
            }
        } catch (error) {
            console.error('Error checking user block status:', error);
            res.redirect('/user/login'); 
        }
    } else {
        res.redirect('/user/login');
    }
    
});
// razor pay credentials
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

// Initialize orders.json if it doesn't  exists


// Adjusted Routes without /user prefix
user_route.get('/', user_Controller.landing);

// Auth 
user_route.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

// Auth Callback 
user_route.get('/auth/google/callback', 
    passport.authenticate('google', { 
        successRedirect: '/success', 
        failureRedirect: '/failure'
    })
);

// Success 
user_route.get('/success', google_contrller.successGoogleLogin);

// Failure 
user_route.get('/failure', google_contrller.failureGoogleLogin);

user_route.get('/home', user_Controller.validation);
user_route.get('/login', user_Controller.loginget);
user_route.post('/login', user_Controller.loginpost);

user_route.get('/signup',  user_Controller.signupget);
user_route.post('/signup', user_Controller.signuppost);

user_route.get('/otp-validation', (req, res) => {
    res.render('user/otpValidation', { error: "", email: "", message: "" });
});
user_route.post('/otp-validation', user_Controller.verifyOTP);

user_route.get('/resend-otp', user_Controller.resendOTP);

// Logout route
user_route.get('/logout', user_Controller.logout);

// User side menu bar get methods
user_route.get('/allProducts', user_Controller.allProducts);
user_route.get('/item/:category', user_Controller.Movie);

// User side product details route
user_route.get('/productd', user_Controller.productdetail);

// User address page
user_route.get('/account', user_Controller.accountOverview);
user_route.post('/account', user_Controller.accountPost);

user_route.get('/address', user_Controller.addressGet);
user_route.post('/address/add', user_Controller.addressAdd);
user_route.post('/address/edit', user_Controller.addressEdit);
user_route.delete('/address/:id', user_Controller.addressDelete);

// User change password
user_route.get('/changepassword', user_Controller.changepassword);
user_route.post('/changepassword', user_Controller.updatePassword);

// User cart routes
user_route.get('/cart', cart_Controller.getCartDetails);
user_route.post('/cart/add', cart_Controller.addToCart);
user_route.delete('/remove-from-cart/:productId', cart_Controller.removeFromCart);
user_route.post('/update-cart', cart_Controller.updatCart);
user_route.post('/addCoupon',cart_Controller.addCoupon)

// User whishlist routes
user_route.get('/wishlist',cart_Controller.getWishlist)
user_route.post('/wish/add',cart_Controller.addToWishList);
user_route.post('/wish/remove',cart_Controller.postWishlist)

// User checkout routes
user_route.get('/checkout', cart_Controller.checkOutget);
// user_route.post('/place-order', cart_Controller.placeOrder);
// user_route.post('/verify-payment',cart_Controller.verifyPayment)
user_route.get('/order-success/:id', cart_Controller.orderSucsess);

// User order history
user_route.get('/orderhistory', cart_Controller.orderDetails);
user_route.get('/orderdetails/:id', cart_Controller.specificOrderDetails);
user_route.get('/payment-success',(req,res) => {
    res.sendFile(path.join(__dirname,'success.html'))
});
user_route.post('/cancelOrder/:id',cart_Controller.orderCancel)

//user wallet routes 
user_route.get('/wallet',cart_Controller.getWallet)

//user paymetn routes 
user_route.post('/create-razorpay-order',cart_Controller.createRazorpayOrder);
user_route.post('/verify-payment',cart_Controller.verifyPayment);
user_route.post('/place-order',cart_Controller.placeOrder)

module.exports = user_route;
