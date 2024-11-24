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
const PDFDocument = require('pdfkit');
const fs = require('fs');
const XLSX = require('xlsx');
const excel = require('exceljs');



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


const getlogin = async (req,res) =>  {
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

const dashboard = async (req, res) => {
    try {
        const { reportRange, startDate, endDate } = req.query;
        let page = parseInt(req.query.page) || 1;
        page = Math.max(page, 1);

        let filterCriteria = {};

        if (reportRange === '7days') {
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - 7);
            filterCriteria.createdAt = { $gte: dateLimit };
        } else if (reportRange === 'today') {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0); 
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999); 
            filterCriteria.createdAt = { $gte: startOfToday, $lte: endOfToday };
        } else if (startDate && endDate) {
            filterCriteria.createdAt = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
        }

        const recordsPerPage = 5;
        const skip = (page - 1) * recordsPerPage;

        const orders = await Orders.find(filterCriteria)
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(recordsPerPage);

        const totalOrders = await Orders.countDocuments(filterCriteria);
        const totalPages = Math.ceil(totalOrders / recordsPerPage);

        if (page > totalPages && totalPages > 0) {
            return res.redirect(`?page=${totalPages}&reportRange=${reportRange}&startDate=${startDate}&endDate=${endDate}`);
        }

        const allOrdersInDateRange = await Orders.find(filterCriteria);

        let dailyRevenue = {};
        let dailySales = {};
        let dailyDiscount = {};
        let statusCounts = {
            Placed: 0,
            Processing: 0,
            Shipped: 0,
            Delivered: 0,
            Cancelled: 0,
            Returned: 0,
            "Payment pending": 0
        };

        allOrdersInDateRange.forEach((order) => {
            const date = new Date(order.createdAt).toISOString().split('T')[0]; 
            
            if (order.status === 'delivered') {
                if (!dailyRevenue[date]) dailyRevenue[date] = 0;
                if (!dailySales[date]) dailySales[date] = 0;
                if (!dailyDiscount[date]) dailyDiscount[date] = 0;

                dailyRevenue[date] += order.totalAmount;
                dailySales[date]++;
                dailyDiscount[date] += (order.Coupon_discount + order.Offer_discount);
            }

            const normalizedStatus = order.status.charAt(0).toUpperCase() + order.status.slice(1);

            if (statusCounts[normalizedStatus] !== undefined) {
                statusCounts[normalizedStatus]++;
            } else {
                console.log(`Unknown status: ${order.status}`);
            }
        });

        const chartData = {
            revenueData: Object.entries(dailyRevenue).map(([date, value]) => ({ period: date, value })),
            salesData: Object.entries(dailySales).map(([date, value]) => ({ period: date, value })),
            discountData: Object.entries(dailyDiscount).map(([date, value]) => ({ period: date, value })),
        };

        const pieChartData = Object.values(statusCounts);

        
        const topProductsData = await Orders.aggregate([
            { $unwind: "$items" },
            { $match: { status: "delivered" , ...filterCriteria } },
            { 
                $group: { 
                    _id: "$items.productId", 
                    totalQuantity: { $sum: "$items.quantity" }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $project: {
                    productId: "$_id",
                    productName: "$productDetails.product_name", 
                    subcategory: "$productDetails.sub_category", 
                    totalQuantity: 1
                }
            }
        ]);
        
        const subcategoryData = await Orders.aggregate([
            { $unwind: "$items" },
            { $match: { status: "delivered" , ...filterCriteria } },
            {
                $group: {
                    _id: "$items.productId",
                    totalQuantity: { $sum: "$items.quantity" }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails.sub_category", 
                    totalSales: { $sum: "$totalQuantity" }
                }
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 }
        ]);
        
        const topProducts = topProductsData.map(item => ({
            productId: item.productId,
            productName: item.productName || "", 
            quantitySold: item.totalQuantity
        }));
        
        const topSubcategories = subcategoryData.map(item => ({
            subcategory: item._id || "", 
            totalSales: item.totalSales
        }));

        res.render('admin/index.ejs', {
            totalRevenue: Object.values(dailyRevenue).reduce((acc, curr) => acc + curr, 0),
            totalSales: Object.values(dailySales).reduce((acc, curr) => acc + curr, 0),
            totalDiscount: Object.values(dailyDiscount).reduce((acc, curr) => acc + curr, 0),
            orders,               
            chartData,            
            pieChartData,         
            totalOrders,          
            totalPages,           
            currentPage: page,
            topProducts,
            topSubcategories,
            reportRange,
            startDate,
            endDate
        });

    } catch (error) {
        console.log(error);
        res.status(500).send('Server error');
    }
};







const pdfDownload = async (req, res) => {
    try {
        const { reportRange, startDate, endDate } = req.query;
        let filterCriteria = {};

        if (reportRange) {
            const today = new Date();
            switch (reportRange) {
                case 'today':
                    filterCriteria.createdAt = { $gte: new Date(today.setHours(0, 0, 0, 0)) };
                    break;
                case '7days':
                    const sevenDaysAgo = new Date(today.setDate(today.getDate() - 7));
                    filterCriteria.createdAt = { $gte: sevenDaysAgo };
                    break;
                case '1month':
                    const oneMonthAgo = new Date(today.setMonth(today.getMonth() - 1));
                    filterCriteria.createdAt = { $gte: oneMonthAgo };
                    break;
                case '3months':
                    const threeMonthsAgo = new Date(today.setMonth(today.getMonth() - 3));
                    filterCriteria.createdAt = { $gte: threeMonthsAgo };
                    break;
                default:
                    break;
            }
        }

        if (startDate && endDate) {
            filterCriteria.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        filterCriteria.status='delivered';

        const orders = await Orders.find(filterCriteria).populate('userId', 'name').sort({ createdAt: -1 });

        const totalRevenue = orders.reduce((total, order) => total + order.totalAmount, 0);
        const totalSales = orders.length;
        const averageOrderValue = totalSales > 0 ? (totalRevenue / totalSales).toFixed(2) : 0;

        const doc = new PDFDocument({
            size: 'A4',
            margin: 30
        });
        doc.pipe(fs.createWriteStream('Sales_Report.pdf'));

        const imagePath = '/images.png';
        doc.image(imagePath, 20, 20, { width: 50, height: 50 }); 

        doc.fillColor('#1976D2')
            .fontSize(24)
            .font('Helvetica-Bold')
            .text('Sales Report', 220, 30, { align: 'left' }); 

        doc.fontSize(12)
            .fillColor('#707070')
            .text(`Generated on ${new Date().toLocaleDateString()}`,20,60, { align: 'center' });
        doc.moveDown(2);


        const metricsSectionHeight = 100; 
        const cardWidth = (doc.page.width - 80) / 3; 
        const cardSpacing = 20;
        const cardY = doc.y;

        const metrics = [
        { label: 'Total Completed Orders', value: totalSales, unit: '' },
        { label: 'Total Revenue', value: totalRevenue.toLocaleString(), unit: 'Rs ' },
        { label: 'Average Order Value', value: averageOrderValue.toLocaleString(), unit: 'Rs ' }
        ];

        metrics.forEach((metric, index) => {
        const cardX = 20 + index * (cardWidth + cardSpacing); 

        doc.fillColor('#FFFFFF')
            .rect(cardX, cardY, cardWidth, metricsSectionHeight)
            .strokeColor('#1976D2')
            .lineWidth(1)
            .stroke();

        doc.fontSize(24).fillColor('#1976D2')
            .font('Helvetica-Bold')
            .text(`${metric.unit}${metric.value}`, cardX, cardY + 25, {
            width: cardWidth,
            align: 'center'
            });

        doc.fontSize(10).fillColor('#707070')
            .font('Helvetica')
            .text(metric.label, cardX, cardY + 60, {
            width: cardWidth,
            align: 'center'
            });
        });

        doc.moveDown(3); 


        doc.fillColor('#1976D2')
            .fontSize(16)
            .font('Helvetica-Bold')
            .text('Order Details', 20, doc.y); 
        doc.moveDown(1.5);

        const xPositions = [20, 80, 170, 270 ,320,370, 460, 515];

        const headers = ['Order ID', 'Customer', 'Products','Offer' ,'Coupon', 'Delivery Charge','Amount', 'Date'];
        doc.fontSize(10).fillColor('#1976D2').font('Helvetica-Bold');

        let headerY = doc.y;

        headers.forEach((header, i) => {
        doc.text(header, xPositions[i], headerY, { align: 'left' });
        });

        doc.moveDown(2.5);

        orders.forEach((order, index) => {
        const rowColor = index % 2 === 0 ? '#F5F5F5' : '#FFFFFF';
        const baseRowHeight = 18; 

        const productRows = order.items.length;
        const rowHeight = baseRowHeight * (productRows + 1);

        doc.fillColor(rowColor)
            .rect(20, doc.y, doc.page.width - 40, rowHeight)
            .fill();

        let rowY = doc.y;

        const customerName = order.userId.name;

        doc.fillColor('black').fontSize(10)
            .text(customerName, xPositions[1], rowY, { align: 'left' });

        const couponApplied = order.Coupon_discount ? `Rs ${order.Coupon_discount}` : 'No Coupon';
        const offerApplied = order.Offer_discount ? `Rs ${order.Offer_discount}` : 'No Offer';
        const deliveryCharge = `      RS ${order.deliveryCharge}`;
        const totalAmount = `Rs ${order.totalAmount.toLocaleString()}`;
        const orderDate = new Date(order.createdAt).toLocaleDateString();

        const columnData = [
            order.orderId,
            '', 
            '', 
            offerApplied,
            couponApplied,
            deliveryCharge,
            totalAmount,
            orderDate
        ];

        columnData.forEach((data, i) => {
            doc.text(data, xPositions[i], rowY, { align: 'left' });
        });

        rowY += baseRowHeight; 

        order.items.forEach((item) => {
            const productLine = `${item.productName} x ${item.quantity}`;
            doc.text(productLine, xPositions[2], rowY, { align: 'left' });
            rowY += baseRowHeight;
        });

        doc.moveDown(1.2);
        });
        

        doc.end();

        res.download('Sales_Report.pdf');
    } catch (error) {
        console.log(error);
        res.status(500).send('Server error');
    }
};

const excelDownload = async (req, res) => {
    try {
        const { startDate, endDate, reportRange } = req.query;
        let filterCriteria = {};

        if (reportRange) {
            const today = new Date();
            switch (reportRange) {
                case 'today':
                    filterCriteria.createdAt = { $gte: new Date(today.setHours(0, 0, 0, 0)) };
                    break;
                case '7days':
                    filterCriteria.createdAt = { $gte: new Date(today.setDate(today.getDate() - 7)) };
                    break;
                case '1month':
                    filterCriteria.createdAt = { $gte: new Date(today.setMonth(today.getMonth() - 1)) };
                    break;
                case '3months':
                    filterCriteria.createdAt = { $gte: new Date(today.setMonth(today.getMonth() - 3)) };
                    break;
            }
        }

        if (startDate && endDate) {
            filterCriteria.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        filterCriteria.status='delivered';

        const orders = await Orders.find(filterCriteria)
            .populate('userId', 'name')
            .sort({ createdAt: -1 });

        const formatCurrency = (amount) => {
            return `${Math.floor(amount || 0)} Rs`;
        };

        const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const formatCustomer = (user) => {
            if (!user) return 'N/A';
            const name = user.name || 'N/A';
            return  `${name} `;
        };

        const formatProducts = (items) => {
            return (items || []).map((item) => {
                const name = item.productName.padEnd(10, ' ');
                const price = item.unitPrice;
                return `${name} (${price}Rs) × ${item.quantity.toString().padStart(3, ' ')}`;
            }).join('\n');
        };

        const formatCoupon = (discount) => {
            if (!discount) return 'No Coupon ';
            return `-${discount}Rs`;
        };

        const formatOffer = (discount) => {
            if (!discount) return 'No Offer ';
            return `-${discount}Rs`;
        };
        const formatDeliver = (discount) => {
            if (!discount) return 'No Offer ';
            return `+ ${discount}Rs`;
        };
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        const stats = {
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0),
            averageOrderValue: orders.length ? 
                orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0) / orders.length : 0
        };

        
        worksheet.mergeCells('A1:H1'); 
        worksheet.getCell('A1').value = 'COMPLETED SALES REPORT';
        worksheet.getCell('A1').font = {
            size: 16,
            bold: true,
            color: { argb: 'FFFFFF' }
        };
        worksheet.getCell('A1').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' }
        };
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells('A2:G2'); 
        worksheet.getCell('A2').value = `Generated on ${formatDate(new Date())}`;
        worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

        worksheet.mergeCells('A4:B4');
        worksheet.getCell('A4').value = 'Summary Statistics';
        worksheet.getCell('A4').font = { bold: true };
        worksheet.getCell('A4').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E0E0E0' }
        };
        worksheet.getCell('A4').alignment = { horizontal: 'left', vertical: 'middle' };

        const statsRows = [
            ['Total Orders:', stats.totalOrders],
            ['Total Revenue:', formatCurrency(stats.totalRevenue)],
            ['Average Order Value:', formatCurrency(stats.averageOrderValue)]
        ];

        statsRows.forEach((row, index) => {
            worksheet.getCell(`A${5 + index}`).value = row[0];
            worksheet.getCell(`B${5 + index}`).value = row[1];
            ['A', 'B'].forEach(col => {
                const cell = worksheet.getCell(`${col}${5 + index}`);
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        worksheet.mergeCells('A8:H8'); 
        worksheet.getCell('A8').value = 'Order Details';
        worksheet.getCell('A8').font = {
            size: 14,
            bold: true,
            color: { argb: 'FFFFFF' }
        };
        worksheet.getCell('A8').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' }
        };
        worksheet.getCell('A8').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' }
        };
        worksheet.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getCell('A8').border = {
            top: { style: 'medium' },
            left: { style: 'medium' },
            right: { style: 'medium' }
        };

        const headers = [
            'Order ID',
            'Customer Details',
            'Products',
            'Offers',
            'Coupon',
            'Delivery Charge',
            'Amount',
            'Date'
        ];

        const startRow = 9;
        headers.forEach((header, index) => {
            const cell = worksheet.getCell(startRow, index + 1);
            cell.value = header;
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'E0E0E0' }
            };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                top: { style: 'medium' },
                bottom: { style: 'medium' },
                left: { style: 'medium' },
                right: { style: 'medium' }
            };
        });

        orders.forEach((order, index) => {
            const row = worksheet.getRow(startRow + index + 1);
            row.values = [
                order.orderId || '',
                formatCustomer(order.userId),
                formatProducts(order.items),
                formatOffer(order.Offer_discount),
                formatCoupon(order.Coupon_discount),
                formatDeliver(order.deliveryCharge),
                formatCurrency(order.totalAmount),
                formatDate(order.createdAt)
            ];
            row.height = 30; 
            row.alignment = { vertical: 'middle', wrapText: true };
            
            row.eachCell((cell, colNumber) => {
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
                if (colNumber === 4 || colNumber === 5 || colNumber === 6) {
                    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
                } else if (colNumber === 1 || colNumber === 7) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                } else {
                    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
                }
            });
        });

        worksheet.columns = [
            { width: 20 },  
            { width: 30 },  
            { width: 45 },  
            { width: 15 },  
            { width: 15 }, 
            { width: 15 },  
            { width: 15 },  
            { width: 20 }   
        ];

        const lastRow = startRow + orders.length;
        worksheet.views = [
            { state: 'frozen', xSplit: 0, ySplit: startRow, topLeftCell: 'A' + (startRow + 1) }
        ];

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename=Sales_Report.xlsx'
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Excel generation error:', error);
        res.status(500).send('Server error');
    }

};




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

        const updatedOrder = await Orders.findByIdAndUpdate(orderId, { status: newStatus }, { new: true });
        
        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

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

        if (newStatus === 'cancelled' && (updatedOrder.paymentMethod === 'Wallet' || updatedOrder.paymentMethod === 'online payment')) {
            console.log('Processing wallet refund...');
            
            let userWallet = await Wallet.findOne({ userId: updatedOrder.userId });

            if (!userWallet) {
                userWallet = new Wallet({
                    userId: updatedOrder.userId,
                    Balance: 0,
                    orderId: '',
                    transactions: []
                });
            }

            userWallet.Balance += updatedOrder.totalAmount;

            userWallet.Transaction.push({
                amount: updatedOrder.totalAmount,
                date: new Date(),
                type: 'credit',
                orderId:updatedOrder.orderId,
                reason: 'Order Cancelled'
            });

            await userWallet.save();
            console.log('Wallet refund successful');
        }

        res.json({ success: true, status: newStatus });
        console.log('Order status updated successfully');
        
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Error updating order status' });
    }
};


const orderapprove = async (req, res) => {
    console.log('Entered to approve return');
    
    const userId = req.session.loggedIn;
    
    try {
        const orderId = req.params.id;
        const order = await Orders.findById(orderId);

        if (!order) {
            console.log('Order not found');
            return res.status(404).json({ message: 'Order not found' });
        }

        if (typeof order.totalAmount !== 'number' || isNaN(order.totalAmount)) {
            return res.status(400).json({ message: 'Invalid total amount in the order' });
        }

        for (const item of order.items) {
            try {
                await Products.findByIdAndUpdate(
                    item.productId,
                    { $inc: { stock: item.quantity } },
                    { new: true }
                );
            } catch (err) {
                console.log('Error updating product stock:', err);
                return res.status(500).json({ message: 'Error updating product stock' });
            }
        }

        const updatedOrder = await Orders.findByIdAndUpdate(
            orderId,
            { returnStatus: 'approved' , status:'Returned' },
            { new: true }
        );

        if (!updatedOrder) {
            console.log('Order update failed');
            return res.status(404).json({ message: 'Order update failed' });
        }

        console.log('Order approval successful');
        
        if (!userId) {
            return res.status(400).json({ message: 'User not logged in' });
        }

        if (updatedOrder.status = 'Returned') {
            for (const item of updatedOrder.items) {
                await Products.findByIdAndUpdate(
                    item.productId,
                    { $inc: { stock: item.quantity } },
                    { new: true }
                );
            }
            console.log('Products restocked');
        }
        if (order.paymentMethod === 'Wallet' || order.paymentMethod === 'online payment' || order.paymentMethod == 'Cash On Delivery') {
            let userWallet = await Wallet.findOne({ userId: userId });
            if (!userWallet) {
                userWallet = new Wallet({
                    userId: userId,
                    Balance: 0,
                    Transaction: []
                });
            }

            userWallet.Balance += order.totalAmount;
            userWallet.Transaction.push({
                amount: order.totalAmount,
                date: new Date(),
                type: 'credit',
                orderId: order.orderId,
                reason: 'Order Returned'
            });

            const savedWallet = await userWallet.save();
            if (!savedWallet) {
                console.log('Wallet update failed');
                return res.status(500).json({ message: 'Failed to update wallet' });
            }

            console.log('Wallet refund successful');
        }
        
        res.status(200).json({ message: 'Order approved successfully', order: updatedOrder });
    } catch (error) {
        console.log('Error:', error);
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};

const orderReject = async (req, res) => {
    console.log('edntererd to ordere rejected');
    
    const orderId = req.params.id;

    try {
        const order = await Orders.findById(orderId);

        if (!order) {
            return res.status(404).send('Order not found');
        }

        const updatedOrder = await Orders.findByIdAndUpdate(
            orderId,
            { returnStatus: 'rejected' },
            { new: true }
        );

        console.log('ordere rejected updated suc essfully');
        
        if (!updatedOrder) {
            return res.status(404).send('Order not found');
        }

        res.status(200).json({ message: 'Order return rejected successfully', order: updatedOrder });
    } catch (error) {
        console.log(error);
        
        res.status(500).send('Server error: ' + error.message);
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
    getlogin,
    orderapprove,
    orderReject,
    dashboard,
    pdfDownload,
    excelDownload
};
