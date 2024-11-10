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

const getCoupon = async (req,res) => {
    try {
        const coupons = await Coupon.find();
        
        res.render('admin/coupon.ejs',{coupons});
    } catch (error) {
        console.log(error);
    }
}

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

        // Validate the date range
        if (new Date(editEndDate) <= new Date(editStartDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        // Check if another coupon with the same code exists (excluding the current coupon being edited)
        const existingCoupon = await Coupon.findOne({ 
            coupon_code: editCouponCode, 
            _id: { $ne: editCouponId } 
        });

        if (existingCoupon) {
            return res.status(409).json({ message: 'Coupon code already exists' });
        }

        // Proceed with updating the coupon if no conflicts
        const updatedCoupon = await Coupon.findByIdAndUpdate(
            editCouponId,
            {
                coupon_code: editCouponCode,
                max_amount: editMaxAmount,
                discount_percentage: editDiscountPercentage,
                start_date: editStartDate,
                end_date: editEndDate
            },
            { new: true } // Return the updated document
        );

        if (updatedCoupon) {
            return res.redirect('/admin/coupons'); // Redirect on successful update
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

const getOffers = async (req,res) => {
     
    const products = await Products.find();
    
    const uniqueSubcategories = await Products.aggregate([
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
    const uniqueCategories = await Products.aggregate([
        {
            $group: {
                _id: "$category",
            }
        },
        {
            $project: {
                _id: 0,
                sub_category: "$_id"
            }
        }
    ]);
    try {
        const offer = await Offers.find();
        res.render('admin/offers.ejs',{offers:offer , products:products , Subcategory:uniqueSubcategories , Category:uniqueCategories})        
    } catch (error) {
        console.log(error);
    }
}

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
        const { editOfferId, ediOfferCode, editDiscount, apply, value, editStartDate, editEndDate } = req.body;

        // Check if the end date is before the start date
        if (new Date(editEndDate) <= new Date(editStartDate)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        // Check if the offer code already exists, excluding the current offer
        const existingOffer = await Offers.findOne({
            offerCode: ediOfferCode,
            _id: { $ne: editOfferId } // Exclude the current offer being updated
        });

        if (existingOffer) {
            return res.status(400).json({ message: 'Offer code already exists' });
        }

        // Proceed with updating the offer
        const updatedOffer = await Offers.findByIdAndUpdate(
            editOfferId,
            {
                offerCode: ediOfferCode,
                discount: editDiscount,
                apply_by: apply,
                value: value,
                start_date: editStartDate,
                end_date: editEndDate
            },
            { new: true } // Return the updated offer
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