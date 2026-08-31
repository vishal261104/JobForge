import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { sendError } from '../../utils/apiResponse';

/**
 * Generic Zod validation middleware.
 *
 * The schema should be shaped as: z.object({ body?, query?, params? })
 * Coerced/transformed values are written back to req.body / req.query / req.params.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const messages = result.error.issues
        .map((issue) => {
          // Strip the top-level 'body'/'query'/'params' from the path
          const path = issue.path.slice(1).join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      sendError(res, messages, 422);
      return;
    }

    const data = result.data as {
      body?: unknown;
      query?: Record<string, unknown>;
      params?: Record<string, string>;
    };

    if (data.body !== undefined) req.body = data.body;
    if (data.query !== undefined) req.query = data.query as typeof req.query;
    if (data.params !== undefined) req.params = data.params as typeof req.params;

    next();
  };
}
