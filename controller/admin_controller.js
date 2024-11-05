const User = require('../model/userModel');
const Products = require('../model/productsModel');
const Admin = require('../model/adminModel')
const Category = require('../model/categoryModel')
const Orders = require('../model/orderModel')
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const categoryModel = require('../model/categoryModel');
const Wallet = require('../model/wallet')

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'products');
        cb(null, uploadPath); 
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `${timestamp}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 3 * 1024 * 1024 } 
}).array('product_images', 3);


const dashboard = async (req,res) =>  {
    res.render('admin/login.ejs')

}

const postlogin = async(req,res)=>{
    const { email, password} = req.body;
    const findData = await Admin.findOne({email:email,password:password})
    try {
        if(findData){
            req.session.AloggedIN=true;
            res.redirect('/admin/dashboard')
        }
        else{
            res.status(401).render('admin/login',{message:"password or email is incorrect"})
        }
    } catch (error) {
        
    }
}

const userdetails = async (req, res) => {
    try {
        const perPage = 5; 
        const page = parseInt(req.query.page) || 1;
        const totalUsers = await User.countDocuments(); 
        const users = await User.find()
            .skip((perPage * page) - perPage)
            .limit(perPage);

        res.render('admin/userdetails.ejs', {
            users: users,
            currentPage: page,
            totalPages: Math.ceil(totalUsers / perPage)
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
const getproducts_editdetails = async (req,res)=>{
    try {
        const product_id = req.params.id
        const product = await Products.findById(product_id)
        if (product) {
            res.render('admin/editProducts.ejs',{
                product:product
            })
        }
    } catch (error) {
        console.log(error)
    }
}

const updatestatus = async (req, res) => {
    const { email, field, value } = req.body;
    try {
        await User.findOneAndUpdate({ email: email }, { [field]: value });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.json({ success: false });
    }
};

const products_details = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; 
        const limit = 8; 
        const skip = (page - 1) * limit; 
        
        const totalProducts = await Products.countDocuments(); 
        const products = await Products.find()
            .skip(skip)
            .limit(limit);

        const totalPages = Math.ceil(totalProducts / limit);

        res.render('admin/products', { 
            products,
            currentPage: page,
            totalPages
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching products');
    }
};
const postproducts_editdetails =  async (req, res) => {
    console.log(req.body);
    
    const productId = req.params.id;
    const updatedData = req.body;

    try {
        const updatedProduct = await Products.findByIdAndUpdate(productId, updatedData, { new: true });

        if (!updatedProduct) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        res.json({ success: true, message: 'Product updated successfully', updatedProduct });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
const getaddproduct = async(req,res)=>{
    const  category = await Category.find()
    res.render('admin/addProducts.ejs',{categories: category });
}

const addProduct = (req, res) => {
    const { product_name, category, sub_category, description, price, stock } = req.body;
    const images = req.files.map(file => file.filename); 

    if (!images || images.length === 0) {
        return res.status(400).json({ message: 'No files uploaded.' });
    }

    try {
        const newProduct = new Products({
            product_name,
            category,
            sub_category,
            description,
            price,
            stock,
            product_images: images
        });

        newProduct.save()
            .then(() => {
                res.redirect('/admin/products'); 
            })
            .catch((error) => {
                console.error(error);
                res.status(500).json({ message: 'Error adding product', error });
            });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error saving product to database', error });
    }
};

const toggle_status = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Products.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        const newStatus = !product.status;
        product.status = newStatus;
        await product.save();
        res.status(200).json({ success: true, product });
    } catch (error) {
        console.error('Error occurred:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


const getCategory = async(req,res)=>{
    const category = await Category.find();
    res.render('admin/category.ejs', {category });
}

const postAddCategory = async (req, res) => {
    try {
        const { category_name, description } = req.body;
        const categoryD = await Category.findOne({category_name: { $regex: new RegExp(`^${category_name}$`, 'i') } });

        if(!categoryD){
            const newCategory = Category({
                category_name,
                description
            })
            newCategory.save()
            .then(() => {
                res.redirect('/admin/category'); 
            })
            .catch((error) => {
                console.error(error);
                res.status(500).json({ message: 'Error adding category', error });
            });
        }
        else{
            res.send('already exits')
        }
    } catch (error) {
        
    }
};

const categoryToggle_status = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });  
        }
        const newStatus = !category.isListed;
        category.isListed = newStatus;
        await category.save();
        res.status(200).json({ success: true, category });  
    } catch (error) {
        console.error('Error occurred:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
const getCategory_editdetails = async (req,res)=>{
    try {
        const category_id = req.params.id
        const category = await Category.findById(category_id)
        if (category) {
            res.render('admin/editCtegory.ejs',{category })
        }
    } catch (error) {
        console.log(error)
    }
    

}

const postCategory_editdetails = async(req, res) => {
    const categoryId = req.params.id;  
    const updatedData = req.body;
    console.log(req.body)

    
    try {
        const updatedCategory = await Category.findByIdAndUpdate(categoryId, updatedData, { new: true });

        if (!updatedCategory) {
            return res.status(400).json({ success: false, message: "Route not found" });
        }

        res.json({ success: true, message: 'Category updated successfully', updatedCategory });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

const orders = async (req,res) => {

    const orders = await Orders.find().populate('userId'); 
    res.render('admin/orders.ejs', { orders }); 
    
}

const updateOrderStatus = async (req, res) => {
    console.log('Entered order status update function');
    
    try {
        const { orderId, newStatus } = req.body;

        // Find and update order status
        const updatedOrder = await Orders.findByIdAndUpdate(orderId, { status: newStatus }, { new: true });
        
        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // If order is cancelled, restock items
        if (newStatus === 'cancelled') {
            for (const item of updatedOrder.items) {
                await Products.findByIdAndUpdate(
                    item.productId,
                    { $inc: { stock: item.quantity } },
                    { new: true }
                );
            }
            console.log('Products restocked');
        }

        // If payment method was wallet or online and order is cancelled, process wallet refund
        if (newStatus === 'cancelled' && (updatedOrder.paymentMethod === 'Wallet' || updatedOrder.paymentMethod === 'online payment')) {
            console.log('Processing wallet refund...');
            
            let userWallet = await Wallet.findOne({ userId: updatedOrder.userId });

            // Create a wallet if it doesn't exist
            if (!userWallet) {
                userWallet = new Wallet({
                    userId: updatedOrder.userId,
                    Balance: 0,
                    transactions: []
                });
            }

            // Add refunded amount to wallet balance
            userWallet.Balance += updatedOrder.totalAmount;

            // Log the refund transaction
            userWallet.Transaction.push({
                amount: updatedOrder.totalAmount,
                date: new Date(),
                type: 'credit',
                reason: 'Order Cancelled'
            });

            await userWallet.save();
            console.log('Wallet refund successful');
        }

        // Send success response
        res.json({ success: true, status: newStatus });
        console.log('Order status updated successfully');
        
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Error updating order status' });
    }
};


module.exports = {
    userdetails,
    updatestatus,
    products_details,
    addProduct,
    toggle_status,
    getproducts_editdetails,
    postproducts_editdetails,
    getCategory,
    postAddCategory,
    categoryToggle_status,
    getCategory_editdetails,
    postCategory_editdetails,
    postlogin,
    getaddproduct,
    orders,
    updateOrderStatus,
    dashboard
};
