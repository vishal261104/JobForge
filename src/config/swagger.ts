/**
 * ─────────────────────────────────────────────────────────────
 *  Stage 11 — OpenAPI 3.0 Specification + Swagger UI
 *
 *  Interactive docs: http://localhost:{PORT}/api-docs
 *  Raw JSON spec:    http://localhost:{PORT}/api-docs.json
 * ─────────────────────────────────────────────────────────────
 */

import { Application } from 'express';
import swaggerUi from 'swagger-ui-express';

// ── OpenAPI 3.0 Specification ─────────────────────────────────

const spec = {
  openapi: '3.0.0',

  info: {
    title: 'QueueForge API',
    description:
      'A production-grade background job processing platform. ' +
      'Submit, track, and manage async jobs with priority queues, ' +
      'exponential backoff retries, dead-letter queue management, and tier-based rate limiting.',
    version: '1.0.0',
    contact: { name: 'QueueForge', url: 'https://github.com/vishal261104/JobForge' },
  },

  servers: [
    { url: 'http://localhost:3000/api/v1', description: 'Local Development' },
  ],

  // ── Security ────────────────────────────────────────────────

  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Obtain a token from POST /auth/login and pass it here.',
      },
    },

    // ── Shared Schemas ─────────────────────────────────────────

    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object', nullable: true },
          message: { type: 'string', nullable: true },
          error: { type: 'string', nullable: true },
          meta: {
            type: 'object',
            nullable: true,
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },

      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'objectid', example: '64e3b8f...' },
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
          tier: { type: 'string', enum: ['free', 'premium'], example: 'free' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      Job: {
        type: 'object',
        properties: {
          jobId:       { type: 'string', format: 'uuid', example: 'b64c33a2-d70d-4f7e-8496-7ae3d7e0a571' },
          userId:      { type: 'string', format: 'objectid' },
          type:        { $ref: '#/components/schemas/JobType' },
          payload:     { type: 'object', example: { to: 'alice@example.com', subject: 'Hello' } },
          priority:    { $ref: '#/components/schemas/JobPriority' },
          status:      { $ref: '#/components/schemas/JobStatus' },
          attempts:    { type: 'integer', example: 1 },
          maxAttempts: { type: 'integer', example: 3 },
          bullJobId:   { type: 'string', nullable: true, example: '42' },
          scheduledAt: { type: 'string', format: 'date-time', nullable: true },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
          nextRetryAt: { type: 'string', format: 'date-time', nullable: true },
          error:       { type: 'string', nullable: true },
          result:      { type: 'object', nullable: true },
          errorHistory: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                attempt:  { type: 'integer' },
                error:    { type: 'string' },
                failedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      JobType: {
        type: 'string',
        enum: ['SEND_EMAIL', 'GENERATE_REPORT', 'PROCESS_IMAGE', 'EXPORT_DATA', 'SEND_NOTIFICATION'],
        example: 'SEND_EMAIL',
      },

      JobStatus: {
        type: 'string',
        enum: ['PENDING', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED'],
        example: 'PENDING',
      },

      JobPriority: {
        type: 'integer',
        enum: [1, 5, 10],
        description: '1 = HIGH, 5 = MEDIUM, 10 = LOW',
        example: 5,
      },

      CreateJobRequest: {
        type: 'object',
        required: ['type', 'payload'],
        properties: {
          type:        { $ref: '#/components/schemas/JobType' },
          payload:     { type: 'object', example: { to: 'alice@example.com', subject: 'Hello', body: 'World' } },
          priority:    { $ref: '#/components/schemas/JobPriority' },
          maxAttempts: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
          scheduledAt: { type: 'string', format: 'date-time', description: 'Must be a future datetime', nullable: true },
        },
      },

      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', minLength: 8, example: 'MySecret123!' },
        },
      },

      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', example: 'MySecret123!' },
        },
      },

      AuthResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT Bearer token', example: 'eyJhbGciO...' },
          user:  { $ref: '#/components/schemas/User' },
        },
      },

      Error400: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string', example: 'Validation failed' } } },
      Error401: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string', example: 'Authorization token required' } } },
      Error403: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string', example: 'Forbidden: insufficient permissions' } } },
      Error404: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string', example: 'Job not found' } } },
      Error429: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string', example: 'Rate limit exceeded' } } },
    },
  },

  // Global security: all routes require Bearer unless overridden
  security: [{ BearerAuth: [] }],

  // ── Paths ───────────────────────────────────────────────────

  paths: {

    // ── Auth ──────────────────────────────────────────────────

    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } } },
        responses: {
          201: { description: 'User registered', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/AuthResponse' } } }] } } } },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error400' } } } },
          409: { description: 'Email already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error400' } } } },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and obtain a JWT token',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: 'Login successful', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/AuthResponse' } } }] } } } },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
        },
      },
    },

    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current authenticated user',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Current user', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/User' } } }] } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error401' } } } },
        },
      },
    },

    // ── Jobs ──────────────────────────────────────────────────

    '/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Submit a new background job',
        description: 'Creates a job, persists it to MongoDB, and enqueues it in BullMQ. Rate limited per user tier (FREE: 100/hr, PREMIUM: 10,000/hr).',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateJobRequest' } } } },
        responses: {
          201: { description: 'Job created and queued', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/Job' } } }] } } } },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
          429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error429' } } } },
        },
      },
      get: {
        tags: ['Jobs'],
        summary: 'List your jobs (paginated)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/JobStatus' } },
          { name: 'type',   in: 'query', schema: { $ref: '#/components/schemas/JobType' } },
          { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',  in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'updatedAt', 'priority', 'status', 'scheduledAt'], default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: { description: 'Paginated job list' },
          401: { description: 'Unauthorized' },
        },
      },
    },

    '/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Get a specific job by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Job details', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiResponse' }, { properties: { data: { $ref: '#/components/schemas/Job' } } }] } } } },
          404: { description: 'Job not found' },
        },
      },
    },

    '/jobs/{id}/cancel': {
      post: {
        tags: ['Jobs'],
        summary: 'Cancel a PENDING or SCHEDULED job',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Job cancelled' },
          422: { description: 'Job cannot be cancelled in its current state' },
        },
      },
    },

    '/jobs/{id}/retry': {
      post: {
        tags: ['Jobs'],
        summary: 'Retry a FAILED, DEAD, or CANCELLED job',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          200: { description: 'Job re-queued for processing' },
          422: { description: 'Job cannot be retried in its current state' },
        },
      },
    },

    '/jobs/{id}/priority': {
      patch: {
        tags: ['Jobs'],
        summary: 'Update job priority (PENDING/SCHEDULED only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['priority'], properties: { priority: { $ref: '#/components/schemas/JobPriority' } } } } },
        },
        responses: {
          200: { description: 'Priority updated and job re-queued' },
          422: { description: 'Job is not in a modifiable state' },
        },
      },
    },

    '/jobs/{id}/schedule': {
      patch: {
        tags: ['Jobs'],
        summary: 'Reschedule a job to a new future time (PENDING/SCHEDULED only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['scheduledAt'], properties: { scheduledAt: { type: 'string', format: 'date-time', description: 'Must be a future datetime' } } } } },
        },
        responses: {
          200: { description: 'Job rescheduled' },
          422: { description: 'Job is not in a reschedulable state' },
        },
      },
    },

    // ── Admin ─────────────────────────────────────────────────

    '/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Platform-wide job statistics',
        description: 'Requires ADMIN role.',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Aggregate stats by status and type' }, 403: { description: 'Admin role required' } },
      },
    },

    '/admin/metrics': {
      get: {
        tags: ['Admin'],
        summary: 'Live BullMQ queue counts and throughput metrics',
        description: 'Real-time data from BullMQ + MongoDB. Requires ADMIN role.',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Queue metrics',
            content: {
              'application/json': {
                example: {
                  queue: { name: 'jobforge', isPaused: false, counts: { waiting: 5, active: 2, delayed: 1, paused: 0, completed: 100, failed: 3 } },
                  worker: { concurrency: 5, activeNow: 2 },
                  throughput: { last1h: { completed: 80, failed: 2, errorRate: 2.44 }, last15m: { completed: 20, failed: 1, errorRate: 4.76, jobsPerMinute: 1.33 } },
                },
              },
            },
          },
          403: { description: 'Admin role required' },
        },
      },
    },

    '/admin/dead-letter-jobs': {
      get: {
        tags: ['Admin — Dead Letter Queue'],
        summary: 'List all DEAD jobs (DLQ)',
        description: 'Paginated. Optionally filter by type. Requires ADMIN role.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'type',  in: 'query', schema: { $ref: '#/components/schemas/JobType' } },
          { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Paginated list of DEAD jobs' }, 403: { description: 'Admin role required' } },
      },
    },

    '/admin/dead-letter-jobs/stats': {
      get: {
        tags: ['Admin — Dead Letter Queue'],
        summary: 'Aggregated DLQ analytics',
        description: 'Counts by type, top errors, oldest job. Requires ADMIN role.',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'DLQ aggregated stats' }, 403: { description: 'Admin role required' } },
      },
    },

    '/admin/dead-letter-jobs/retry-all': {
      post: {
        tags: ['Admin — Dead Letter Queue'],
        summary: 'Bulk retry all DEAD jobs',
        description: 'Optionally filter by type. Returns count of re-queued / failed. Requires ADMIN role.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { type: { $ref: '#/components/schemas/JobType' } } } } },
        },
        responses: {
          200: { description: 'Bulk retry results', content: { 'application/json': { example: { requeued: 12, failed: 0, total: 12 } } } },
          403: { description: 'Admin role required' },
        },
      },
    },

    '/admin/dead-letter-jobs/{id}': {
      get: {
        tags: ['Admin — Dead Letter Queue'],
        summary: 'Get a specific DEAD job with full error history',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'DEAD job details' }, 404: { description: 'Not found' } },
      },
      delete: {
        tags: ['Admin — Dead Letter Queue'],
        summary: 'Permanently purge a DEAD job from the database',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Job purged' }, 404: { description: 'Not found' } },
      },
    },

    '/admin/dead-letter-jobs/{id}/retry': {
      post: {
        tags: ['Admin — Dead Letter Queue'],
        summary: 'Retry a specific DEAD job (full reset)',
        description: 'Resets attempts to 0, clears error, re-enqueues. Keeps errorHistory for audit. Requires ADMIN role.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Job re-queued' }, 404: { description: 'Not found' } },
      },
    },
  },
};

// ── Mount Function ────────────────────────────────────────────

export function mountSwagger(app: Application): void {
  const uiOptions: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: 'QueueForge API Docs',
    customCss: `
      .swagger-ui .topbar { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
      .swagger-ui .topbar .link { display: none; }
      .swagger-ui .info .title { color: #e94560; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
    },
  };

  // Interactive Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec as object, uiOptions));

  // Redirect root and /docs to /api-docs for better developer experience
  app.get(['/', '/docs'], (_req, res) => {
    res.redirect('/api-docs');
  });

  // Redirect dashboard aliases to Bull Board UI
  app.get(['/dashboard', '/queues'], (_req, res) => {
    res.redirect('/admin/queues');
  });

  // Raw OpenAPI JSON for tooling (Postman import, code gen, etc.)
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(spec);
  });
}
