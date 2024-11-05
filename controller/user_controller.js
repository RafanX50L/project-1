const User = require('../model/userModel');
const Products = require('../model/productsModel')
const nodemailer = require('nodemailer')
const Category = require('../model/categoryModel');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const loginget = async (req, res) => {

    try {
        res.render('user/login.ejs');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
}

const loginpost = async (req, res) => {
    try {
        console.log('welcome');
        const { email, password } = req.body;
        const finddata = await User.findOne({ email: email, password: password, isblocked: false });

        if (finddata) {
            req.session.loggedIn = finddata._id;
            res.redirect('/user/home');
        } else {

            res.status(401).render('user/login', { message: "password or email is incorrect" })

        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
}

const signupget = async (req, res) => {
    try {
        res.render('user/signup.ejs');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
}

const signuppost = async (req, res) => {
    console.log(req.body);
    try {
        const { name, password, email } = req.body;

        const matchData = await User.findOne({ email });
        if (matchData) {

            return res.status(409).json({ error: 'User already exists' });
        } else {
            const otp = generateOTP();
            const otpExpires = Date.now() + 60 * 1000;

            sendOTPEmail(email, otp);
            req.session.email = email;
            const user = new User({
                name,
                password,
                email,
                otp
            })

            await user.save();
            res.json({ message: "success" })
            res.status(200)
            console.log('dhsfudhf')


        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
}

const verifyOTP = async (req, res) => {
    const { otp } = req.body;
    let email = req.session.email;

    try {
        const user_Data = await User.findOne({ email: email });
        const time = Date.now() - new Date(user_Data.updatedAt).getTime();


        if (time > 60000) {
            await User.updateOne({ email: email }, { $unset: { otp: "" } });
            return res.status(400).json({ error: 'OTP expired, please request a new one.' });
        }


        if (user_Data.otp !== parseInt(otp)) {
            return res.status(400).json({ error: 'Invalid OTP, please try again.' });
        }

        await User.updateOne({ email: email }, { $unset: { otp: "" }, $set: { verify: true } });
        res.status(200).json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        await User.updateOne({ email: email }, { $unset: { otp: "" } });
        res.status(500).json({ error: 'Internal server error' });
    }
};


const resendOTP = async (req, res) => {

    let email = req.session.email;


    const otp = generateOTP();
    const user_Data = await User.updateOne(
        { email: email },
        { $set: { otp: otp } }
    );

    sendOTPEmail(email, otp);

    res.status(200);
    res.render('user/otpValidation', { error: "", email: "", message: "New OTP sent to your email." })
};

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000);
};

const sendOTPEmail = (userEmail, otp) => {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    let mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Your OTP Code',
        text: `Your OTP code is ${otp}, valid for 2 minutes.`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
};

const allProducts = async (req, res) => {
    try {
        const { search, sort } = req.query; 
        const filter = { status: true };

        if (search) {
            filter.product_name = { $regex: search, $options: 'i' }; 
        }

        let products = await Products.find({...filter,stock:{$gt:0}})

        if (sort) {
            switch (sort) {
                case 'popularity':
                    products = products.sort((a, b) => b.popularity - a.popularity);
                    break;
                case 'rating':
                    products = products.sort((a, b) => b.rating - a.rating);
                    break;
                case 'newness':
                    products = products.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    break;
                case 'price-low-to-high':
                    products = products.sort((a, b) => a.price - b.price);
                    break;
                case 'price-high-to-low':
                    products = products.sort((a, b) => b.price - a.price);
                    break;
                case 'a-to-z':
                    products = products.sort((a, b) => a.product_name.localeCompare(b.product_name));
                    break;
                case 'z-to-a':
                    products = products.sort((a, b) => b.product_name.localeCompare(a.product_name));
                    break;
                default:
                    break;
            }
        }

        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });

        if (products && products.length > 0) {
            res.render('user/product.ejs', { products, c: category, searchQuery: search || '', sortOption: sort || '' });
        } else {
            res.send('No products found.');
        }
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send('An error occurred while fetching products.');
    }
};


const Movie = async (req, res) => {
    if (req.session.loggedIn) {
        const category = req.params.category;
        console.log(category)
        const category1 = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });

        try {
            const products = await Products.find({ category: category, status: true ,stock:{$gt:0}});
            const uniqueSubcategories = await Products.aggregate([
                {
                    $match: { category: category }
                },
                {
                    $group: {
                        _id: "$sub_category",
                    }
                },
                {
                    $project: {
                        _id: 0,
                        sub_category: "$_id"
                    }
                }
            ]);
            console.log(uniqueSubcategories)


            res.render('user/Movies.ejs', { subcategories: uniqueSubcategories, category: category, c: category1, products: products });
        } catch (error) {
            console.error(error);
            res.status(500).send("Error retrieving data");
        }
    }
    else {
        res.redirect('/user')
    }

}

const productdetail = async (req, res) => {
    if (req.session.loggedIn) {
        const id = req.query.id;
        const category1 = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });


        try {
            const product = await Products.findOne({ _id: id, status: true ,stock:{$gt:0} });
            const category = product.category;
            const Category = await Products.find({
                category: category,
                _id: { $ne: id }
            });

            if (!(product && category)) {
                return res.status(404).send('Product not found');
            }

            res.render('user/product-detail.ejs', { product: product, category: Category, c: category1 });
        } catch (error) {
            console.error('Error fetching product:', error);
            res.status(500).redirect('/user/error')
        }
    }
    else {
        res.redirect('/user')
    }
}

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).send('Failed to destroy session');
            }
            res.clearCookie('connect.sid');
            res.redirect('/user/home');
        });
    } catch (error) {

    }
}
const validation = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        const products = await Products.find({stock:{$gt:0}});
        
        res.render('user/Home.ejs', { c: category, products: products });
        
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).send("Internal Server Error");
    }
};

const landing = async (req, res) => {
    if(req.session.loggedIn){
        res.redirect('/user/home')
    }
    else{
        const products = await Products.find();
        res.render('user/landing.ejs', { products: products });
    }
}

const accountOverview = async (req, res) => {
    let user;
    const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });

    user = await User.findOne({ _id: req.session.loggedIn });
   
    if (!user) {
        console.log('User not found');

        return res.status(404).send('User not found');
    }

    res.render('user/account_overview.ejs', { user ,c: category });
};

const accountPost = async (req, res) => {
    const sessionId = req.session.loggedIn; 
    const updateData = req.body;           
    console.log(updateData);

    try {
        let updatedUser;

        updatedUser = await User.findByIdAndUpdate(sessionId, updateData, { new: true });

        if (updatedUser) {
            console.log("User updated successfully:", updatedUser);
            res.redirect('/user/account'); 
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send("Error updating user");
    }
};

const addressGet = async (req, res) => {
    try {
        const sessionId = req.session.loggedIn;
        let user;
        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });

        user = await User.findOne({ _id: sessionId });

        if (user) {
            res.render('user/address_page', { addresses: user.addresses ,c: category});
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error fetching user addresses:", error);
        res.status(500).send("Error fetching user addresses");
    }
};

const addressAdd = async (req, res) => {
    try {
        const { name, houseNumber, street, city, state, zip, country, phone } = req.body;
        const sessionId = req.session.loggedIn;
        let user;

        user = await User.findOne({ _id: sessionId });

        if (user) {
            user.addresses.push({
                name,
                houseNumber,
                street,
                city,
                state,
                zip,
                country,
                phone
            });

            await user.save();

            res.status(200).redirect('/user/address');
        } else {
            res.status(404).send("User not found");
        }
    } catch (error) {
        console.error("Error adding address:", error);
        res.status(500).send("Error adding address");
    }
};

const addressEdit = async (req, res) => {
    const { addressId, name, houseNumber, street, city, state, zip, country, phone } = req.body;
    const sessionId = req.session.loggedIn;

    try {
        let user;
        user = await User.findOne({ _id: sessionId });

        if (user) {
            const address = user.addresses.id(addressId);
            if (address) {
                address.name = name;
                address.houseNumber = houseNumber;
                address.street = street;
                address.city = city;
                address.state = state;
                address.zip = zip;
                address.country = country;
                address.phone = phone;
                await user.save();
                res.redirect('/user/address');
            } else {
                res.status(404).send('Address not found');
            }
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        console.error('Error editing address:', error);
        res.status(500).send('Server Error');
    }
};

const addressDelete = async (req, res) => {
    const { id } = req.params;
    const sessionId = req.session.loggedIn;

    try {
        let user = await User.findOne({ _id: sessionId });

        if (user) {
            const result = await User.updateOne(
                { _id: user._id },
                { $pull: { addresses: { _id: id } } }
            );
            if (result.modifiedCount === 0) {
                return res.status(404).json({ message: 'Address not found.' });
            }
            res.status(200).json({ message: 'Address deleted successfully' });
        } else {
            res.status(404).json({ message: 'User not found.' });
        }
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ message: 'An error occurred while deleting the address.' });
    }
};

const changepassword = async (req, res) => {
    try {
        const category = await Category.find({ isListed: true }, { category_name: 1, _id: 0 });
        res.render('user/changepassword.ejs',{c: category})
    } catch (error) {
        console.log(error)
    }
}

const updatePassword = async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const sessionId = req.session.loggedIn;  

    try {
        let user = await User.findOne({ _id: sessionId });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.password) {
            if (!newPassword || newPassword !== confirmPassword) {
                return res.status(400).json({ message: "New password and confirm password do not match" });
            }
            

            user.password = newPassword;
        } else {

            if (user.password) {
                if (user.password !== currentPassword) {
                    return res.status(400).json({ message: "Current password is incorrect" });
                }
                if (newPassword !== confirmPassword) {
                    return res.status(400).json({ message: "New password and confirm password do not match" });
                }
                else if(newPassword == user.password){
                    return res.status(400).json({ message: "New password and current password is same" });
    
                }
                user.password = newPassword;
            }
        }

        await user.save();

        res.status(200).json({ message: "Password updated successfully" });

    } catch (error) {
        console.error("Error updating password:", error);
        res.status(500).json({ message: "Error updating password" });
    }
};



module.exports = {
    signupget,
    signuppost,
    loginget,
    loginpost,
    verifyOTP,
    resendOTP,
    allProducts,
    Movie,
    productdetail,
    logout,
    validation,
    landing,
    accountOverview,
    accountPost,
    addressGet,
    addressAdd,
    addressEdit,
    addressDelete,
    changepassword,
    updatePassword,
};
