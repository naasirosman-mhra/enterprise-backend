import { Router } from 'express';
import { listCategories, getCategory, createCategory, updateCategory, deleteCategory } from '../controllers/categories.controller.js';
import { createCategoryValidator, updateCategoryValidator } from '../validators/categories.validators.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', listCategories);
router.get('/:id', getCategory);
router.post('/', createCategoryValidator, createCategory);
router.put('/:id', updateCategoryValidator, updateCategory);
router.delete('/:id', deleteCategory);

export default router;
