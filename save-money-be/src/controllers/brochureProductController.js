const express = require('express');
const { verifySession } = require('../services/authService');
const {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../services/brochureProductCrud');

const brochureProductsRouter = express.Router();

brochureProductsRouter.use(verifySession);

brochureProductsRouter.get('/', listProducts);
brochureProductsRouter.get('/:id', getProductById);
brochureProductsRouter.post('/', createProduct);
brochureProductsRouter.put('/:id', updateProduct);
brochureProductsRouter.patch('/:id', updateProduct);
brochureProductsRouter.delete('/:id', deleteProduct);

module.exports = brochureProductsRouter;
