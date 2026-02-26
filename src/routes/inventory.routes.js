import { Router } from 'express';
import { listItems, getItem, createItem, updateItem, deleteItem } from '../controllers/inventory.controller.js';
import { createItemValidator, updateItemValidator } from '../validators/inventory.validators.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', listItems);
router.get('/:id', getItem);
router.post('/', createItemValidator, createItem);
router.put('/:id', updateItemValidator, updateItem);
router.delete('/:id', deleteItem);

export default router;
