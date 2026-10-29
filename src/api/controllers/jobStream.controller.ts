import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Job from '../../models/Job';
import { JobStatus, UserRole, AuthenticatedUser } from '../../types';
import { verifyToken } from '../../utils/jwt';
import { subscribeToJob, subscribeToUser, JobEventPayload } from '../../utils/eventBus';
import logger from '../../utils/logger';

// ── Helper: Authenticate from header OR query param ───────────

function resolveUser(req: Request): AuthenticatedUser | null {
  // 1. From standard middleware if already populated
  if (req.user) return req.user;

  // 2. From Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      return verifyToken(token);
    } catch {
      return null;
    }
  }

  // 3. From ?token= query param (native browser EventSource support)
  const queryToken = req.query.token as string | undefined;
  if (queryToken) {
    try {
      return verifyToken(queryToken);
    } catch {
      return null;
    }
  }

  return null;
}

// ── Stream Single Job Events (SSE) ────────────────────────────

export async function streamJobEvents(req: Request, res: Response): Promise<void> {
  const user = resolveUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized: valid token required' });
    return;
  }

  const { id } = req.params;
  const job = await Job.findOne({ jobId: id });

  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found' });
    return;
  }

  // Check ownership unless admin
  const isOwner = job.userId.toString() === user.id;
  const isAdmin = user.role === UserRole.ADMIN;
  if (!isOwner && !isAdmin) {
    res.status(403).json({ success: false, error: 'Access denied: not your job' });
    return;
  }

  // Configure Server-Sent Events headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial snapshot
  const initialPayload = {
    jobId: job.jobId,
    type: job.type,
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    scheduledAt: job.scheduledAt,
    result: job.result,
    error: job.error,
    timestamp: new Date().toISOString(),
  };

  res.write(`event: initial\ndata: ${JSON.stringify(initialPayload)}\n\n`);

  // If already finished, close cleanly
  const terminalStatuses: JobStatus[] = [JobStatus.COMPLETED, JobStatus.DEAD, JobStatus.CANCELLED];
  if (terminalStatuses.includes(job.status)) {
    res.write(`event: terminal\ndata: ${JSON.stringify(initialPayload)}\n\n`);
    res.end();
    return;
  }

  // Keep connection alive with heartbeat comments every 15s
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15_000);

  let isClosed = false;

  // Subscribe to Redis Pub/Sub for live updates
  const unsubscribe = await subscribeToJob(id, (event: JobEventPayload) => {
    if (isClosed) return;

    res.write(`event: update\ndata: ${JSON.stringify(event)}\n\n`);

    if (
      event.status === JobStatus.COMPLETED ||
      event.status === JobStatus.DEAD ||
      event.status === JobStatus.CANCELLED
    ) {
      res.write(`event: terminal\ndata: ${JSON.stringify(event)}\n\n`);
      cleanup();
      res.end();
    }
  });

  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    clearInterval(heartbeat);
    unsubscribe().catch(() => {});
  }

  req.on('close', () => {
    cleanup();
    logger.debug({ jobId: id, userId: user.id }, '🔌  SSE client disconnected from job stream');
  });
}

// ── Stream All User Jobs (SSE) ────────────────────────────────

export async function streamUserJobs(req: Request, res: Response): Promise<void> {
  const user = resolveUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: 'Unauthorized: valid token required' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ userId: user.id, time: new Date().toISOString() })}\n\n`);

  // Support one-off connection verification (useful for health checks & automated tests)
  if (req.query.once === 'true') {
    res.end();
    return;
  }

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15_000);

  let isClosed = false;

  const unsubscribe = await subscribeToUser(user.id, (event: JobEventPayload) => {
    if (isClosed) return;
    res.write(`event: job_update\ndata: ${JSON.stringify(event)}\n\n`);
  });

  function cleanup() {
    if (isClosed) return;
    isClosed = true;
    clearInterval(heartbeat);
    unsubscribe().catch(() => {});
  }

  req.on('close', () => {
    cleanup();
    logger.debug({ userId: user.id }, '🔌  SSE client disconnected from user jobs stream');
  });
}

// ── Interactive HTML Live Progress Viewer ─────────────────────

export async function renderLiveDemo(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const token = (req.query.token as string) || '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>JobForge — Real-Time Job Progress</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px; display: flex; justify-content: center; }
    .card { background: #1e293b; border-radius: 12px; padding: 32px; width: 620px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); border: 1px solid #334155; }
    h1 { margin-top: 0; font-size: 24px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .meta { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-weight: 600; font-size: 12px; text-transform: uppercase; margin-bottom: 20px; }
    .status-PENDING { background: #3b82f620; color: #60a5fa; border: 1px solid #3b82f6; }
    .status-PROCESSING { background: #eab30820; color: #facc15; border: 1px solid #eab308; }
    .status-COMPLETED { background: #22c55e20; color: #4ade80; border: 1px solid #22c55e; }
    .status-FAILED, .status-DEAD { background: #ef444420; color: #f87171; border: 1px solid #ef4444; }
    .progress-bar-bg { background: #334155; border-radius: 9999px; height: 16px; overflow: hidden; margin-bottom: 12px; }
    .progress-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #38bdf8, #818cf8); transition: width 0.4s ease; border-radius: 9999px; }
    .progress-text { display: flex; justify-content: space-between; font-size: 14px; font-weight: 500; margin-bottom: 24px; }
    pre { background: #090d16; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto; color: #a5b4fc; border: 1px solid #1e293b; max-height: 200px; }
    .log-entry { font-size: 12px; color: #cbd5e1; margin-bottom: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ JobForge Live Stream</h1>
    <div class="meta">Watching Job UUID: <b>${id}</b></div>
    <div>Status: <span id="badge" class="status-badge status-PENDING">CONNECTING</span></div>

    <div class="progress-bar-bg">
      <div id="bar" class="progress-bar-fill"></div>
    </div>
    <div class="progress-text">
      <span>Progress</span>
      <span id="percent">0%</span>
    </div>

    <h3>Live Event Stream</h3>
    <div id="logs" style="max-height: 120px; overflow-y: auto; margin-bottom: 16px;"></div>

    <h3>Job Data / Result</h3>
    <pre id="dataJson">Waiting for stream data...</pre>
  </div>

  <script>
    const streamUrl = '/api/v1/jobs/${id}/events${token ? `?token=${token}` : ''}';
    const evtSource = new EventSource(streamUrl);
    const badge = document.getElementById('badge');
    const bar = document.getElementById('bar');
    const percent = document.getElementById('percent');
    const logs = document.getElementById('logs');
    const dataJson = document.getElementById('dataJson');

    function log(msg) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
      logs.prepend(div);
    }

    evtSource.addEventListener('initial', (e) => {
      const data = JSON.parse(e.data);
      badge.textContent = data.status;
      badge.className = 'status-badge status-' + data.status;
      dataJson.textContent = JSON.stringify(data, null, 2);
      log('Initial state received: ' + data.status);
    });

    evtSource.addEventListener('update', (e) => {
      const data = JSON.parse(e.data);
      badge.textContent = data.status;
      badge.className = 'status-badge status-' + data.status;
      if (data.progress !== undefined) {
        bar.style.width = data.progress + '%';
        percent.textContent = data.progress + '%';
        log('Progress: ' + data.progress + '%');
      }
      dataJson.textContent = JSON.stringify(data, null, 2);
    });

    evtSource.addEventListener('terminal', (e) => {
      const data = JSON.parse(e.data);
      badge.textContent = data.status;
      badge.className = 'status-badge status-' + data.status;
      bar.style.width = '100%';
      percent.textContent = '100%';
      dataJson.textContent = JSON.stringify(data, null, 2);
      log('Job finished with status: ' + data.status);
      evtSource.close();
    });

    evtSource.onerror = (err) => {
      log('Stream disconnected or finished.');
      evtSource.close();
    };
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}
