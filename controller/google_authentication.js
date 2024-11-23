const { use } = require('passport');
const User = require('../model/userModel');
const Wallet = require('../model/wallet'); 
const Cart = require('../model/cartModel');
const wishlist = require('../model/whishlist');
const loadAuth = (req, res) => {
    res.render('auth');
}

const successGoogleLogin = async (req, res) => {
    if (!req.user) {
        return res.redirect('/user/failure'); 
    }

    const { displayName, emails, id } = req.user;

    try {
        const email = emails[0].value;

        let user = await User.findOne({ email });

        if (!user) {
            user = new User({
                name: displayName,
                email,
                gid: id,
                verify: true, 
            });

            await user.save();

            await Promise.all([
                Cart.create({ userId: user._id, items: [] }),
                wishlist.create({ userId: user._id, items: [] }),
                Wallet.create({ userId: user._id, Balance: 0, transactions: [] }),
            ]);

            req.session.userId = user._id; 
            return res.redirect('/user/home');
        }

        if (user.isblocked === true) {
            return res.redirect('/user/blocked');
        }

        await User.updateOne({ email }, { $set: { gid: id } });

        req.session.userId = user._id; 
        return res.redirect('/user/home');
    } catch (error) {
        console.error('Error during Google login:', error.message);
        return res.redirect('/user/failure');
    }
};



const failureGoogleLogin = (req , res) => { 
	res.render('user/googleLoginerro.ejs') 
}

module.exports = {
    loadAuth,
    successGoogleLogin,
    failureGoogleLogin
}