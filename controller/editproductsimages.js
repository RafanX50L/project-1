const products = require('../model/productsModel');
const path = require('path');
const fs = require('fs');

const addProductImages = async (req, res) => {
    console.log('Route hit for adding a new product image');

    try {
        const { productId } = req.params;

        const product = await products.findById(productId);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        console.log('Product found:', product);

        if (!product.product_images) {
            product.product_images = [];
        }

        const uploadedImageName = req.file.filename;

        product.product_images.push(uploadedImageName);

        await product.save();

        console.log('Image added to product:', uploadedImageName);

        res.status(200).json({
            success: true,
            message: 'Image uploaded and added to product successfully',
            uploadedImageName,
        });
    } catch (error) {
        console.error('Error adding product image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add image to product',
            error: error.message,
        });
    }
};



const editProductImages = async (req,res) => {
    console.log('entered to the edit image route ');
    
    try {
        const { productId } = req.params;
        const { index } = req.body; 
        const file = req.file;

        if (!file) {
            console.log('image is not provided ');
            console.log(file);
            
            
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }

        const product = await products.findById(productId);

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const imageIndex = parseInt(index, 10);
        if (isNaN(imageIndex) || imageIndex < 0 || imageIndex >= product.product_images.length) {
            return res.status(400).json({ success: false, message: 'Invalid image index' });
        }

        const oldImage = product.product_images[imageIndex];
        product.product_images[imageIndex] = file.filename;

        await product.save();

        const oldImagePath = path.join(__dirname, '..', 'public', 'products', oldImage);
        if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
        }

        res.json({ success: true, message: 'Image updated successfully' });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ success: false, message: 'Failed to update image' });
    }
}


const deleteProductImage = async (req,res) => {
    try {
        const { productId } = req.params;
        const { index, image } = req.body;

        const product = await products.findById(productId);
        if (product.product_images.length <= 3) {
                console.log('less 3 ');
                
                return res.status(400).json({
                    success: false,
                    message: 'A product should have a minimum of 3 images. Cannot delete any further.'
                });
            }


        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (!product.product_images || product.product_images.length === 0) {
            return res.status(404).json({ success: false, message: 'No images to delete' });
        }

        const imageToDelete = product.product_images[index];

        if (imageToDelete !== image) {
            return res.status(400).json({ success: false, message: 'Image does not match index' });
        }

        product.product_images.splice(index, 1);

        const imagePath = path.join(__dirname, '..', 'public', 'products', imageToDelete);

        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        } else {
            return res.status(400).json({ success: false, message: 'Image file not found on server' });
        }

        await product.save();

        res.json({ success: true, message: 'Image deleted successfully' });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete image',
            error: error.message
        });
    }
}

module.exports = {
    addProductImages,
    editProductImages,
    deleteProductImage
};
