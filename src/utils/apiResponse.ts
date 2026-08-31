import { Response } from 'express';
import { ApiResponse } from '../types';

/**
 * Sends a successful JSON response with optional pagination meta.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
  meta?: ApiResponse['meta']
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    ...(meta && { meta }),
  };
  res.status(statusCode).json(response);
}

/**
 * Sends an error JSON response.
 */
export function sendError(res: Response, error: string, statusCode = 400): void {
  const response: ApiResponse = { success: false, error };
  res.status(statusCode).json(response);
}
