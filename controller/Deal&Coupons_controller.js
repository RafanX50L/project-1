const User = require('../model/userModel');
const Products = require('../model/productsModel');
const Admin = require('../model/adminModel')
const Category = require('../model/categoryModel')
const Orders = require('../model/orderModel')
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const categoryModel = require('../model/categoryModel');
const Coupon = require('../model/coupon');
const Offers = require('../model/offer');

const getCoupon = async (req, res) => {
    try {
        const { search, page = 1 } = req.query;
        const limit = 8;
        const skip = (page - 1) * limit;
        const query = search ? { coupon_code: { $regex: search, $options: "i" } } : {};
        const totalcoupons = await Coupon.countDocuments(query);
        const coupons = await Coupon.find(query)
            .skip(skip)
            .limit(limit);
        const totalPages = Math.ceil(totalcoupons / limit);
        res.render('admin/coupon.ejs', {
            coupons,
            currentPage: parseInt(page),
            totalPages,
            search
        });
    } catch (error) {
        console.log(error);
    }
};
 

const addCoupon = async (req, res) => {
    try {
        const { couponCode, maxAmount, discountPercentage, startDate, endDate } = req.body;

        if (new Date(endDate) <= new Date(startDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date or equal' });
        }

        const couponCheck = await Coupon.findOne({ coupon_code: couponCode });
        if (!couponCheck) {
            const newCoupon = new Coupon({
                coupon_code: couponCode,
                max_amount: maxAmount,
                discount_percentage: discountPercentage,
                start_date: startDate,
                end_date: endDate
            });

            await newCoupon.save();
            return res.redirect('/admin/coupons');
        } else {
            return res.status(400).json({ message: 'Coupon already exists' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error adding coupon', error });
    }
}

const editCoupon = async (req, res) => {
    try {
        const { editCouponId, editCouponCode, editMaxAmount, editDiscountPercentage, editStartDate, editEndDate } = req.body;

        if (new Date(editEndDate) <= new Date(editStartDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }
        const existingCoupon = await Coupon.findOne({ 
            coupon_code: editCouponCode, 
            _id: { $ne: editCouponId } 
        });

        if (existingCoupon) {
            return res.status(409).json({ message: 'Coupon code already exists' });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            editCouponId,
            {
                coupon_code: editCouponCode,
                max_amount: editMaxAmount,
                discount_percentage: editDiscountPercentage,
                start_date: editStartDate,
                is_expired:false,
                end_date: editEndDate
            },
            { new: true } 
        );
        if (updatedCoupon) {
            return res.redirect('/admin/coupons'); 
        } else {
            return res.status(404).json({ message: 'Coupon not found' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error updating coupon', error });
    }
};


const toggleCouponStatus = async (req, res) => {
    try {
        
        const { id, status } = req.body;        
        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status provided.' });
        }
        
        const newStatus = status === 'active' ? 'inactive' : 'active'; 

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            id,
            { status: newStatus },
            { new: true } 
        );

        if (updatedCoupon) {
            res.json({ message: 'Coupon status updated successfully', newStatus });
        } else {
            res.status(404).json({ message: 'Coupon not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating coupon status', error });
    }
};

const getOffers = async (req, res) => {
    try {
        const { search, page = 1 } = req.query;
        const limit = 8;
        const skip = (page - 1) * limit;

        const query = search ? { offerCode: { $regex: search, $options: "i" } } : {};

        const products = await Products.find();
        
        const uniqueSubcategories = await Products.aggregate([
            { $group: { _id: "$sub_category" } },
            { $project: { _id: 0, sub_category: "$_id" } }
        ]);

        const uniqueCategories = await Products.aggregate([
            { $group: { _id: "$category" } },
            { $project: { _id: 0, category: "$_id" } }
        ]);

        const totalOffers = await Offers.countDocuments(query);
        const offers = await Offers.find(query)
            .skip(skip)
            .limit(limit);

        const totalPages = Math.ceil(totalOffers / limit);

        res.render('admin/offers.ejs', {
            offers,
            products,
            Subcategory: uniqueSubcategories,
            Category: uniqueCategories,
            currentPage: parseInt(page),
            totalPages,
            search
        });
    } catch (error) {
        console.log(error);
    }
};


const addOffers = async (req, res) => {
    try {
        const { offerCode, discount, apply, value, validFrom, validUntil, productIds } = req.body;

        if (new Date(validUntil) <= new Date(validFrom)) {
            return res.status(400).json({ message: 'End date cannot be before start date or equal' });
        }

        const offerCheck = await Offers.findOne({ offerCode: offerCode });
        if (offerCheck) {
            return res.status(400).json({ message: 'Offer already exists' });
        }

        let field;
        let condition = {};
        if (apply === 'Product') {
            field = 'product_name';
            condition = { _id: { $in: productIds } };  
        } else if (apply === 'Subcategory') {
            field = 'sub_category';
            condition = { sub_category: value };  
        }

        const newOffer = new Offers({
            offerCode,
            discount,
            apply_by: apply,
            value,
            validFrom,
            validUntil,
            condition 
        });

        await newOffer.save();

        return res.redirect('/admin/offers');
    } catch (error) {
        console.log(error);
        res.status(500).send('Error adding the offer.');
    }
};


const toggleOffersStatus = async (req, res) => {
    try {
        
        const { id, status } = req.body;        
        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status provided.' });
        }
        
        const newStatus = status === 'active' ? 'inactive' : 'active'; 

        const updatedOffers = await Offers.findByIdAndUpdate(
            id,
            { status: newStatus },
            { new: true } 
        );

        if (updatedOffers) {
            res.json({ message: 'Offer status updated successfully', newStatus });
        } else {
            res.status(404).json({ message: 'Offer not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating offer status', error });
    }
};

const editOffer = async (req, res) => {
    try {
        const { editOfferId, editOfferCode, editDiscount, apply, value, editStartDate, editEndDate } = req.body;

        if (new Date(editEndDate) <= new Date(editStartDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        const existingOffer = await Offers.findOne({
            offerCode: editOfferCode,
            _id: { $ne: editOfferId } 
        });

        if (existingOffer) {
            return res.status(400).json({ message: 'Offer code already exists' });
        }

        const updatedOffer = await Offers.findByIdAndUpdate(
            editOfferId,
            {
                offerCode: editOfferCode,
                discount: editDiscount,
                apply_by: apply,
                value: value,
                start_date: editStartDate,
                end_date: editEndDate,
                is_expired:false
            },
            { new: true } 
        );

        if (updatedOffer) {
            return res.redirect('/admin/offers');
        } else {
            return res.status(404).json({ message: 'Offer not found' });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error updating Offer', error });
    }
};




module.exports = {
    getCoupon,
    addCoupon,
    editCoupon,
    toggleCouponStatus,
    getOffers,
    addOffers,
    toggleOffersStatus,
    editOffer
}