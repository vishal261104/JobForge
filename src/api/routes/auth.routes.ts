import { Router } from 'express';
import { validate } from '../middlewares/validate.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { register, login, getMe } from '../controllers/auth.controller';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', validate(registerSchema), asyncHandler(register));

// POST /api/v1/auth/login
router.post('/login', validate(loginSchema), asyncHandler(login));

// GET /api/v1/auth/me  (protected)
router.get('/me', authenticate, asyncHandler(getMe));

export default router;
