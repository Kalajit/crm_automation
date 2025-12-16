// // // const productService = require('../services/products/productCatalog.service');
// // // const logger = require('../utils/logger');

// // // class ProductsController {
// // //   // Create product
// // //   async createProduct(req, res) {
// // //     try {
// // //       const product = await productService.createProduct(req.body);
// // //       res.status(201).json({ success: true, data: product });
// // //     } catch (error) {
// // //       // logger.error('Error creating product:', error);
// // //       console.error('Error creating product :', error);
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get product
// // //   async getProduct(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const product = await productService.getProductById(id);
// // //       res.json({ success: true, data: product });
// // //     } catch (error) {
// // //       res.status(404).json({ error: error.message });
// // //     }
// // //   }

// // //   // List products
// // //   async listProducts(req, res) {
// // //     try {
// // //       const { company_id } = req.params;
// // //       const filters = req.query;
// // //       const products = await productService.getProducts(company_id, filters);
// // //       res.json({ success: true, data: products });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Update product
// // //   async updateProduct(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const product = await productService.updateProduct(id, req.body);
// // //       res.json({ success: true, data: product });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Delete product
// // //   async deleteProduct(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       await productService.deleteProduct(id);
// // //       res.json({ success: true, message: 'Product deleted' });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Update stock
// // //   async updateStock(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const { variant_id, quantity, operation } = req.body;
      
// // //       const result = await productService.updateStock(id, variant_id, quantity, operation);
// // //       res.json({ success: true, data: result });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get inventory report
// // //   async getInventoryReport(req, res) {
// // //     try {
// // //       const { company_id } = req.params;
// // //       const report = await productService.getInventoryReport(company_id);
// // //       res.json({ success: true, data: report });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get product price
// // //   async getProductPrice(req, res) {
// // //     try {
// // //       const { id } = req.params;
// // //       const { price_list_id, variant_id } = req.query;
      
// // //       const pricing = await productService.getProductPrice(id, price_list_id, variant_id);
// // //       res.json({ success: true, data: pricing });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Get categories
// // //   async getCategories(req, res) {
// // //     try {
// // //       const { company_id } = req.params;
// // //       const categories = await productService.getCategories(company_id);
// // //       res.json({ success: true, data: categories });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }

// // //   // Bulk update prices
// // //   async bulkUpdatePrices(req, res) {
// // //     try {
// // //       const { product_ids, price_change, is_percentage } = req.body;
// // //       const result = await productService.bulkUpdatePrices(product_ids, price_change, is_percentage);
// // //       res.json({ success: true, data: result });
// // //     } catch (error) {
// // //       res.status(500).json({ error: error.message });
// // //     }
// // //   }
// // // }


// // // module.exports={ ProductsController: new ProductsController()};






// // const productService = require('../services/products/productCatalog.service');

// // class ProductsController {
// //   // Create product
// //   async createProduct(req, res) {
// //     try {
// //       const product = await productService.createProduct(req.body);
// //       res.status(201).json({ success: true, data: product });
// //     } catch (error) {
// //       console.error('Error creating product:', error.message);
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get product
// //   async getProduct(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const product = await productService.getProductById(id);
// //       res.json({ success: true, data: product });
// //     } catch (error) {
// //       res.status(404).json({ error: error.message });
// //     }
// //   }

// //   // List products
// //   async listProducts(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const filters = req.query;
// //       const products = await productService.getProducts(company_id, filters);
// //       res.json({ success: true, data: products });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Update product
// //   async updateProduct(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const product = await productService.updateProduct(id, req.body);
// //       res.json({ success: true, data: product });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Delete product
// //   async deleteProduct(req, res) {
// //     try {
// //       const { id } = req.params;
// //       await productService.deleteProduct(id);
// //       res.json({ success: true, message: 'Product deleted' });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Update stock
// //   async updateStock(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { variant_id, quantity, operation } = req.body;
      
// //       const result = await productService.updateStock(id, variant_id, quantity, operation);
// //       res.json({ success: true, data: result });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get inventory report
// //   async getInventoryReport(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const report = await productService.getInventoryReport(company_id);
// //       res.json({ success: true, data: report });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get product price
// //   async getProductPrice(req, res) {
// //     try {
// //       const { id } = req.params;
// //       const { price_list_id, variant_id } = req.query;
      
// //       const pricing = await productService.getProductPrice(id, price_list_id, variant_id);
// //       res.json({ success: true, data: pricing });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Get categories
// //   async getCategories(req, res) {
// //     try {
// //       const { company_id } = req.params;
// //       const categories = await productService.getCategories(company_id);
// //       res.json({ success: true, data: categories });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }

// //   // Bulk update prices
// //   async bulkUpdatePrices(req, res) {
// //     try {
// //       const { product_ids, price_change, is_percentage } = req.body;
// //       const result = await productService.bulkUpdatePrices(product_ids, price_change, is_percentage);
// //       res.json({ success: true, data: result });
// //     } catch (error) {
// //       res.status(500).json({ error: error.message });
// //     }
// //   }
// // }

// // module.exports = new ProductsController();










// const pool = require('../config/database');
// const logger = require('../utils/logger');
// const ProductCatalogService = require('../services/products/productCatalog.service');

// // Initialize service
// const productService = new ProductCatalogService(pool);

// class ProductsController {
//   // Create product
//   async createProduct(req, res) {
//     try {
//       if (!req.body.company_id) {
//         return res.status(400).json({ error: 'Company ID is required' });
//       }

//       if (!req.body.product_name) {
//         return res.status(400).json({ error: 'Product name is required' });
//       }
      
//       const product = await productService.createProduct(req.body);
//       res.status(201).json({ success: true, data: product });
//     } catch (error) {
//       logger.error('Error creating product:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get product
//   async getProduct(req, res) {
//     try {
//       const { id } = req.params;
//       const product = await productService.getProductById(id);
//       res.json({ success: true, data: product });
//     } catch (error) {
//       logger.error('Error getting product:', error);
//       res.status(404).json({ error: error.message });
//     }
//   }

//   // List products
//   async listProducts(req, res) {
//     try {
//       const { company_id } = req.params;
//       const filters = req.query;
      
//       const products = await productService.getProducts(company_id, filters);
//       res.json({ success: true, data: products });
//     } catch (error) {
//       logger.error('Error listing products:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Update product
//   async updateProduct(req, res) {
//     try {
//       const { id } = req.params;
//       const product = await productService.updateProduct(id, req.body);
//       res.json({ success: true, data: product });
//     } catch (error) {
//       logger.error('Error updating product:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Delete product
//   async deleteProduct(req, res) {
//     try {
//       const { id } = req.params;
//       await productService.deleteProduct(id);
//       res.json({ success: true, message: 'Product deleted successfully' });
//     } catch (error) {
//       logger.error('Error deleting product:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Update stock
//   async updateStock(req, res) {
//     try {
//       const { id } = req.params;
//       const { variant_id, quantity, operation } = req.body;
      
//       if (quantity === undefined) {
//         return res.status(400).json({ error: 'Quantity is required' });
//       }
      
//       const result = await productService.updateStock(id, variant_id, quantity, operation);
//       res.json({ success: true, data: result });
//     } catch (error) {
//       logger.error('Error updating stock:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get inventory report
//   async getInventoryReport(req, res) {
//     try {
//       const { company_id } = req.params;
//       const report = await productService.getInventoryReport(company_id);
//       res.json({ success: true, data: report });
//     } catch (error) {
//       logger.error('Error getting inventory report:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Set stock alert
//   async setStockAlert(req, res) {
//     try {
//       const { id } = req.params;
//       const { variant_id, threshold } = req.body;

//       if (threshold === undefined) {
//         return res.status(400).json({ error: 'Threshold is required' });
//       }
      
//       const result = await productService.setStockAlert(id, variant_id, threshold);
//       res.json({ success: true, data: result });
//     } catch (error) {
//       logger.error('Error setting stock alert:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get product price
//   async getProductPrice(req, res) {
//     try {
//       const { id } = req.params;
//       const { price_list_id, variant_id } = req.query;
      
//       const pricing = await productService.getProductPrice(id, price_list_id, variant_id);
//       res.json({ success: true, data: pricing });
//     } catch (error) {
//       logger.error('Error getting product price:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Get categories
//   async getCategories(req, res) {
//     try {
//       const { company_id } = req.params;
//       const categories = await productService.getCategories(company_id);
//       res.json({ success: true, data: categories });
//     } catch (error) {
//       logger.error('Error getting categories:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Create category
//   async createCategory(req, res) {
//     try {
//       const { company_id } = req.params;
//       const { category_name, description } = req.body;

//       if (!category_name) {
//         return res.status(400).json({ error: 'Category name is required' });
//       }
      
//       const category = await productService.createCategory(company_id, { category_name, description });
//       res.status(201).json({ success: true, data: category });
//     } catch (error) {
//       logger.error('Error creating category:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Add variant
//   async addVariant(req, res) {
//     try {
//       const { id } = req.params;
      
//       if (!req.body.variant_name) {
//         return res.status(400).json({ error: 'Variant name is required' });
//       }
      
//       const variant = await productService.addVariant(id, req.body);
//       res.status(201).json({ success: true, data: variant });
//     } catch (error) {
//       logger.error('Error adding variant:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Update variant
//   async updateVariant(req, res) {
//     try {
//       const { id, variant_id } = req.params;
      
//       const variant = await productService.updateVariant(id, variant_id, req.body);
//       res.json({ success: true, data: variant });
//     } catch (error) {
//       logger.error('Error updating variant:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Delete variant
//   async deleteVariant(req, res) {
//     try {
//       const { id, variant_id } = req.params;
      
//       await productService.deleteVariant(id, variant_id);
//       res.json({ success: true, message: 'Variant deleted successfully' });
//     } catch (error) {
//       logger.error('Error deleting variant:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Bulk update prices
//   async bulkUpdatePrices(req, res) {
//     try {
//       const { product_ids, price_change, is_percentage } = req.body;
      
//       if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
//         return res.status(400).json({ error: 'Product IDs array is required' });
//       }
      
//       if (price_change === undefined) {
//         return res.status(400).json({ error: 'Price change is required' });
//       }
      
//       const result = await productService.bulkUpdatePrices(product_ids, price_change, is_percentage);
//       res.json({ success: true, data: result });
//     } catch (error) {
//       logger.error('Error bulk updating prices:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Bulk update stock
//   async bulkUpdateStock(req, res) {
//     try {
//       const { updates } = req.body;
      
//       if (!updates || !Array.isArray(updates) || updates.length === 0) {
//         return res.status(400).json({ error: 'Updates array is required' });
//       }
      
//       const result = await productService.bulkUpdateStock(updates);
//       res.json({ success: true, data: result });
//     } catch (error) {
//       logger.error('Error bulk updating stock:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }

//   // Bulk import
//   async bulkImport(req, res) {
//     try {
//       const { company_id, products } = req.body;
      
//       if (!company_id) {
//         return res.status(400).json({ error: 'Company ID is required' });
//       }

//       if (!products || !Array.isArray(products) || products.length === 0) {
//         return res.status(400).json({ error: 'Products array is required' });
//       }
      
//       const result = await productService.bulkImportProducts(company_id, products);
//       res.status(201).json({ success: true, data: result });
//     } catch (error) {
//       logger.error('Error bulk importing products:', error);
//       res.status(500).json({ error: error.message });
//     }
//   }
// }

// module.exports = new ProductsController();







const pool = require('../config/database');
// const logger = require('../utils/logger');
const { logger } = require('../utils/logger');
// const { logger } = require('../../utils/logger');

const ProductCatalogService = require('../services/products/productCatalog.service');

// // Handle both export patterns
// const ProductCatalogService = productServiceModule.ProductCatalogService || productServiceModule.default || productServiceModule;

// Initialize service
const productService = new ProductCatalogService(pool);

class ProductsController {
  // Create product
  async createProduct(req, res) {
    try {
      if (!req.body.company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
      }

      if (!req.body.name) {
        return res.status(400).json({ error: 'Product name is required' });
      }
      
      const product = await productService.createProduct(req.body);
      res.status(201).json({ success: true, data: product });
    } catch (error) {
      logger.error('Error creating product:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get product
  async getProduct(req, res) {
    try {
      const { id } = req.params;
      const product = await productService.getProductById(id);
      res.json({ success: true, data: product });
    } catch (error) {
      logger.error('Error getting product:', error);
      res.status(404).json({ error: error.message });
    }
  }

  // List products
  async listProducts(req, res) {
    try {
      const { company_id } = req.params;
      const filters = req.query;
      
      const products = await productService.getProducts(company_id, filters);
      res.json({ success: true, data: products });
    } catch (error) {
      logger.error('Error listing products:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update product
  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const product = await productService.updateProduct(id, req.body);
      res.json({ success: true, data: product });
    } catch (error) {
      logger.error('Error updating product:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete product
  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      await productService.deleteProduct(id);
      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      logger.error('Error deleting product:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update stock
  async updateStock(req, res) {
    try {
      const { id } = req.params;
      const { variant_id, quantity, operation } = req.body;
      
      if (quantity === undefined) {
        return res.status(400).json({ error: 'Quantity is required' });
      }
      
      const result = await productService.updateStock(id, variant_id, quantity, operation);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error updating stock:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get inventory report
  async getInventoryReport(req, res) {
    try {
      const { company_id } = req.params;
      const report = await productService.getInventoryReport(company_id);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Error getting inventory report:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Set stock alert
  async setStockAlert(req, res) {
    try {
      const { id } = req.params;
      const { variant_id, threshold } = req.body;

      if (threshold === undefined) {
        return res.status(400).json({ error: 'Threshold is required' });
      }
      
      const result = await productService.setStockAlert(id, variant_id, threshold);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error setting stock alert:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get product price
  async getProductPrice(req, res) {
    try {
      const { id } = req.params;
      const { price_list_id, variant_id } = req.query;
      
      const pricing = await productService.getProductPrice(id, price_list_id, variant_id);
      res.json({ success: true, data: pricing });
    } catch (error) {
      logger.error('Error getting product price:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get categories
  async getCategories(req, res) {
    try {
      const { company_id } = req.params;
      const categories = await productService.getCategories(company_id);
      res.json({ success: true, data: categories });
    } catch (error) {
      logger.error('Error getting categories:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create category
  async createCategory(req, res) {
    try {
      const { company_id } = req.params;
      const { category_name, description } = req.body;

      if (!category_name) {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      const category = await productService.createCategory(company_id, { category_name, description });
      res.status(201).json({ success: true, data: category });
    } catch (error) {
      logger.error('Error creating category:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Add variant
  async addVariant(req, res) {
    try {
      const { id } = req.params;
      
      if (!req.body.variant_name) {
        return res.status(400).json({ error: 'Variant name is required' });
      }
      
      const variant = await productService.addVariant(id, req.body);
      res.status(201).json({ success: true, data: variant });
    } catch (error) {
      logger.error('Error adding variant:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update variant
  async updateVariant(req, res) {
    try {
      const { id, variant_id } = req.params;
      
      const variant = await productService.updateVariant(id, variant_id, req.body);
      res.json({ success: true, data: variant });
    } catch (error) {
      logger.error('Error updating variant:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Delete variant
  async deleteVariant(req, res) {
    try {
      const { id, variant_id } = req.params;
      
      await productService.deleteVariant(id, variant_id);
      res.json({ success: true, message: 'Variant deleted successfully' });
    } catch (error) {
      logger.error('Error deleting variant:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Bulk update prices
  async bulkUpdatePrices(req, res) {
    try {
      const { product_ids, price_change, is_percentage } = req.body;
      
      if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
        return res.status(400).json({ error: 'Product IDs array is required' });
      }
      
      if (price_change === undefined) {
        return res.status(400).json({ error: 'Price change is required' });
      }
      
      const result = await productService.bulkUpdatePrices(product_ids, price_change, is_percentage);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error bulk updating prices:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Bulk update stock
  async bulkUpdateStock(req, res) {
    try {
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Updates array is required' });
      }
      
      const result = await productService.bulkUpdateStock(updates);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error bulk updating stock:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Bulk import
  async bulkImport(req, res) {
    try {
      const { company_id, products } = req.body;
      
      if (!company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
      }

      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: 'Products array is required' });
      }
      
      const result = await productService.bulkImportProducts(company_id, products);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      logger.error('Error bulk importing products:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ProductsController();