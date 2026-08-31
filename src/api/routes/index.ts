import { Router } from 'express';
import authRouter from './auth.routes';
import jobRouter from './job.routes';

const router = Router();

router.use('/auth', authRouter);
router.use('/jobs', jobRouter);

export default router;
