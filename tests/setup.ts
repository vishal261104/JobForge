/**
 * Global test setup — runs before all test files.
 * - Loads environment variables from .env.test (if present) or .env
 * - Any global mocks or test utilities can be added here
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test-specific env first, fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Ensure we're in test mode
process.env.NODE_ENV = 'test';
