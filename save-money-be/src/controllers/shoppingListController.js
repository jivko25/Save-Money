const express = require('express');
const { verifySession } = require('../services/authService');
const multer = require('multer');
const shoppingListRouter = express.Router();
const { shoppingListCrud, shoppingListRoles, itemsCrud } = require('../services/shoppingListService');


const storage = multer.memoryStorage();
const upload = multer({ storage });


shoppingListRouter.use(verifySession);

shoppingListRouter.post('/', shoppingListCrud.createShoppingList);
shoppingListRouter.get('/', shoppingListCrud.getShoppingLists);
shoppingListRouter.get('/:id', shoppingListCrud.getShoppingListById);
shoppingListRouter.put('/:id', shoppingListCrud.updateShoppingList);
shoppingListRouter.delete('/:id', shoppingListCrud.deleteShoppingList);

shoppingListRouter.post('/invite', shoppingListRoles.inviteUserToShoppingList);

shoppingListRouter.post('/:shoppingListId/items/from-images',upload.array('images'), itemsCrud.addItemsToList);
shoppingListRouter.get('/:shoppingListId/items', itemsCrud.getItemsByShoppingListId);
shoppingListRouter.get('/:shoppingListId/items/:itemId', itemsCrud.getItemById);
shoppingListRouter.put('/:shoppingListId/items/:itemId', itemsCrud.updateItem);
shoppingListRouter.delete('/:shoppingListId/items/:itemId', itemsCrud.deleteItem);

module.exports = shoppingListRouter;