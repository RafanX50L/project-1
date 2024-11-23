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
    const email = emails[0].value;
    try {
        let user = await User.findOne({ email: email });
        if (!user) {
            
            user = new User({
                name: displayName,
                email: emails[0].value,
                gid: id 
            });
    
            await user.save();
            await User.updateOne({ email: emails[0].value }, { $set: { verify: true } });
            await Cart.create({ userId: user._id, items: [] });
            await wishlist.create({ userId: user._id, items: [] });
            await Wallet.create({ userId: user._id, Balance: 0, transactions: [] });;

            req.session.loggedIn = user._id;
            res.redirect('/user/home');
        } else if (user.isblocked === false) {  
            console.log('hello');
            const updatedUser = await User.findOneAndUpdate({email:email},{gid:id},{new:true})
            req.session.loggedIn = user._id;
            res.redirect('/user/home');
        } else {
            res.redirect('/user/blocked');
        }
    } catch (error) {
        console.error('Error during Google login:', error);
        res.redirect('/user/failure');
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