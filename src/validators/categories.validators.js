import { body } from 'express-validator';

export const createCategoryValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
];

export const updateCategoryValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('description').optional().trim(),
];
