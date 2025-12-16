// const express = require('express');
// const router = express.Router();
// const { ProductsController } = require('../controllers/products.controller');

// // Product CRUD
// router.post('/', ProductsController.createProduct);
// router.get('/:id', ProductsController.getProduct);
// router.get('/company/:company_id', ProductsController.listProducts);
// router.put('/:id', ProductsController.updateProduct);
// router.delete('/:id', ProductsController.deleteProduct);

// // Inventory
// router.put('/:id/stock', ProductsController.updateStock);
// router.get('/company/:company_id/inventory', ProductsController.getInventoryReport);

// // Pricing
// router.get('/:id/price', ProductsController.getProductPrice);

// // Categories
// router.get('/company/:company_id/categories', ProductsController.getCategories);

// // Bulk operations
// router.post('/bulk/update-prices', ProductsController.bulkUpdatePrices);

// module.exports = router;




const express = require('express');
const router = express.Router();
const ProductsController = require('../controllers/products.controller');

// Product CRUD routes
router.post('/', ProductsController.createProduct);
router.get('/:id', ProductsController.getProduct);
router.get('/company/:company_id', ProductsController.listProducts);
router.put('/:id', ProductsController.updateProduct);
router.delete('/:id', ProductsController.deleteProduct);

// Inventory management
router.put('/:id/stock', ProductsController.updateStock);
router.get('/company/:company_id/inventory', ProductsController.getInventoryReport);
router.post('/:id/stock-alerts', ProductsController.setStockAlert);

// Pricing & Categories
router.get('/:id/price', ProductsController.getProductPrice);
router.get('/company/:company_id/categories', ProductsController.getCategories);
router.post('/company/:company_id/categories', ProductsController.createCategory);

// Variants
router.post('/:id/variants', ProductsController.addVariant);
router.put('/:id/variants/:variant_id', ProductsController.updateVariant);
router.delete('/:id/variants/:variant_id', ProductsController.deleteVariant);

// Bulk operations
router.post('/bulk/update-prices', ProductsController.bulkUpdatePrices);
router.post('/bulk/update-stock', ProductsController.bulkUpdateStock);
router.post('/bulk/import', ProductsController.bulkImport);

module.exports = router;