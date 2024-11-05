const express = require("express");
const session = require("express-session");
const mongoose = require('mongoose');
const path = require('path');
const cron = require('node-cron'); 
const user_Controller = require('./controller/user_controller');
require('dotenv').config();
const passport = require('passport');
require('./public/js/passport')


mongoose.connect('mongodb://localhost:27017/week7')
    .then(() => console.log("MongoDB connected successfully"))
    .catch((error) => console.error('MongoDB connection error:', error));


const Coupon = require('./model/coupon'); 
const Offers = require('./model/offer')

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'view'));

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.use((req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
});

const updateExpiredCoupons = async () => {
    try {
        const now = new Date();
        const updatedCoupons = await Coupon.updateMany(
            { end_date: { $lt: now } , is_expired:false }, 
            { $set: { is_expired: true } 
        });
        console.log(`Updated ${updatedCoupons.modifiedCount} coupons as expired.`);
        const updatedOffers = await Offers.updateMany(
            { validUntil: { $lt: now } , is_expired:false }, 
            { $set: { is_expired: true } } 
        );
        console.log(`Updated ${updatedOffers.modifiedCount} offers as expired.`);

    } catch (error) {
        console.error('Error updating expired coupons:', error);
    }
};

//for every minutes  = * * * * *
//for every midnight = 0 0 * * *
// Every Hour        = 0 * * * *
// Every 12 Hours    = 0 */12 * * *
// Every Week        = 0 0 * * 0
// Every Month       = 0 0 1 * *

cron.schedule('0 * * * *', () => {
    console.log('Checking for expired coupons...');
    updateExpiredCoupons();
});

const userRoute = require('./router/user_route');
const adminRoute = require('./router/admin_route');

app.use('/user', userRoute);
app.use('/admin', adminRoute);
app.get('/',user_Controller.landing)
app.get('/auth/google/callback', 
    passport.authenticate('google', { 
        successRedirect: '/user/success', 
        failureRedirect: '/user/failure'
    })
);
app.get('*', (req, res) => {
    res.render('user/404.ejs');
});
app.listen(3000, () => {
    console.log("Server is running on localhost:3000");
});