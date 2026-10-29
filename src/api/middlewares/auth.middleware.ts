import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../../utils/jwt';
import { UserRole } from '../../types';
import { sendError } from '../../utils/apiResponse';

/**
 * Verifies the Bearer JWT token from the Authorization header.
 * Attaches the decoded user payload to req.user on success.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query?.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    sendError(res, 'Authorization token required', 401);
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    sendError(res, 'Invalid or expired token', 401);
  }
}

/**
 * Role-based access control guard.
 * Must be composed after authenticate().
 *
 * Usage: router.get('/admin', authenticate, authorize(UserRole.ADMIN), handler)
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 'Forbidden: insufficient permissions', 403);
      return;
    }

    next();
  };
}
