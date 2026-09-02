import { Router } from 'express';
import authRouter  from './auth.routes';
import jobRouter   from './job.routes';
import adminRouter from './admin.routes';

const router = Router();

router.use('/auth',  authRouter);
router.use('/jobs',  jobRouter);
router.use('/admin', adminRouter);

export default router;
