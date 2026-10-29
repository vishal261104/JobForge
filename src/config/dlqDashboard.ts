import { Application, Request, Response } from 'express';
import logger from '../utils/logger';

/**
 * Mounts the dedicated DLQ Remediation Web Dashboard at /admin/dlq.
 * Provides a point-and-click UI with visual buttons to list dead jobs,
 * inspect error histories, retry individual jobs, bulk-retry all jobs,
 * and purge poison pills without manually crafting curl requests.
 */
export function mountDLQDashboard(app: Application): void {
  app.get(['/admin/dlq', '/admin/remediation'], (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(renderDashboardHTML());
  });

  logger.info('🛠️   DLQ Remediation Dashboard mounted at /admin/dlq');
}

function renderDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JobForge — DLQ Remediation Dashboard</title>
  <style>
    :root {
      --bg: #0b1120;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; }
    
    /* Header */
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
    .logo { font-size: 22px; font-weight: 700; color: var(--accent); display: flex; align-items: center; gap: 8px; }
    .nav-links { display: flex; gap: 12px; }
    .btn-link { color: var(--text-muted); text-decoration: none; font-size: 13px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); transition: all 0.2s; }
    .btn-link:hover { color: var(--text); border-color: var(--accent); }

    /* Auth Banner */
    .auth-banner { background: #1e1b4b; border: 1px solid #4338ca; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .auth-input-group { display: flex; gap: 8px; }
    .input { background: #0f172a; border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: 6px; font-size: 12px; width: 280px; }
    .btn { cursor: pointer; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: #0284c7; color: white; }
    .btn-primary:hover { background: #0369a1; }
    .btn-success { background: #059669; color: white; }
    .btn-success:hover { background: #047857; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-secondary { background: #334155; color: white; }
    .btn-secondary:hover { background: #475569; }

    /* Stats Grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 18px; }
    .stat-title { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .stat-val { font-size: 26px; font-weight: 700; color: var(--text); }
    .stat-val.dead { color: #f87171; }
    .stat-val.healthy { color: #4ade80; }

    /* Action Bar */
    .action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .filter-group { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--text-muted); }
    select.input { width: 160px; }

    /* Table */
    .table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
    th { background: #0f172a; padding: 12px 16px; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--border); font-size: 12px; text-transform: uppercase; }
    td { padding: 14px 16px; border-bottom: 1px solid #26334d; vertical-align: middle; }
    tr:hover { background: #243247; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-dead { background: #ef444420; color: #f87171; border: 1px solid #ef444450; }
    .badge-type { background: #38bdf820; color: #38bdf8; border: 1px solid #38bdf850; }
    .error-text { color: #fca5a5; font-family: monospace; font-size: 11px; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Toast */
    #toast { position: fixed; bottom: 24px; right: 24px; background: #059669; color: white; padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; display: none; box-shadow: 0 10px 15px rgba(0,0,0,0.5); z-index: 100; }
    
    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: none; justify-content: center; align-items: center; z-index: 50; }
    .modal-content { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; width: 560px; max-width: 90%; padding: 24px; max-height: 80vh; overflow-y: auto; }
    .modal-title { font-size: 18px; margin-bottom: 12px; color: var(--accent); }
    pre { background: #090d16; padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; color: #cbd5e1; border: 1px solid var(--border); margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <span>🛡️ JobForge DLQ Remediation</span>
      </div>
      <div class="nav-links">
        <a href="/admin/queues" class="btn-link" target="_blank">📊 Bull Board</a>
        <a href="/api-docs" class="btn-link" target="_blank">📖 Swagger Docs</a>
        <a href="/health" class="btn-link" target="_blank">❤️ Health</a>
      </div>
    </header>

    <!-- Admin Authentication Bar -->
    <div class="auth-banner">
      <div>
        <span><b>Admin Authentication:</b> <span id="authStatusText">Checking credentials...</span></span>
      </div>
      <div class="auth-input-group">
        <input type="password" id="adminTokenInput" class="input" placeholder="Paste ADMIN JWT Token...">
        <button onclick="saveToken()" class="btn btn-primary">Save Token</button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Total Dead-Letter Jobs</div>
        <div id="statTotalDead" class="stat-val dead">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Failed in Last 24 Hours</div>
        <div id="statRecentDead" class="stat-val">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Most Common Failure</div>
        <div id="statTopError" class="stat-val" style="font-size: 16px; font-weight: 500;">None</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Oldest Quarantined Job</div>
        <div id="statOldestJob" class="stat-val" style="font-size: 14px; font-weight: 500;">None</div>
      </div>
    </div>

    <!-- Master Action Bar -->
    <div class="action-bar">
      <div class="filter-group">
        <label>Filter by Type:</label>
        <select id="typeFilter" class="input" onchange="loadDeadJobs()">
          <option value="">All Job Types</option>
          <option value="SEND_EMAIL">SEND_EMAIL</option>
          <option value="GENERATE_REPORT">GENERATE_REPORT</option>
          <option value="PROCESS_IMAGE">PROCESS_IMAGE</option>
          <option value="EXPORT_DATA">EXPORT_DATA</option>
          <option value="SEND_NOTIFICATION">SEND_NOTIFICATION</option>
        </select>
        <button onclick="loadDashboard()" class="btn btn-secondary">🔄 Refresh</button>
      </div>

      <div>
        <button onclick="retryAllJobs()" class="btn btn-success" id="btnRetryAll">
          🔁 Bulk Retry All Dead Jobs
        </button>
      </div>
    </div>

    <!-- Table of Dead-Letter Jobs -->
    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Type</th>
            <th>Attempts</th>
            <th>Last Error Reason</th>
            <th>Quarantined At</th>
            <th style="text-align: right;">Remediation Actions</th>
          </tr>
        </thead>
        <tbody id="deadJobsTableBody">
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
              Loading Dead-Letter Queue...
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Audit Modal -->
  <div id="modal" class="modal-overlay" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-title" id="modalTitle">Error Audit History</div>
      <div id="modalBody">Loading...</div>
      <div style="margin-top: 16px; text-align: right;">
        <button onclick="closeModal()" class="btn btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast">Action completed successfully</div>

  <script>
    let currentToken = localStorage.getItem('jobforge_admin_token') || '';

    // Check URL param ?token=
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
      currentToken = urlParams.get('token');
      localStorage.setItem('jobforge_admin_token', currentToken);
    }

    if (currentToken) {
      document.getElementById('adminTokenInput').value = currentToken;
      document.getElementById('authStatusText').textContent = '✅ Token Saved';
      document.getElementById('authStatusText').style.color = '#4ade80';
    } else {
      document.getElementById('authStatusText').textContent = '⚠️ Please paste an ADMIN token to enable buttons';
      document.getElementById('authStatusText').style.color = '#facc15';
    }

    function saveToken() {
      const val = document.getElementById('adminTokenInput').value.trim();
      if (!val) return;
      currentToken = val;
      localStorage.setItem('jobforge_admin_token', val);
      document.getElementById('authStatusText').textContent = '✅ Token Saved';
      document.getElementById('authStatusText').style.color = '#4ade80';
      showToast('Admin token saved');
      loadDashboard();
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.style.background = isError ? '#dc2626' : '#059669';
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }

    async function apiRequest(path, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      if (currentToken) headers['Authorization'] = 'Bearer ' + currentToken;
      return fetch('/api/v1/admin' + path, { ...options, headers });
    }

    async function loadStats() {
      try {
        const res = await apiRequest('/dead-letter-jobs/stats');
        if (!res.ok) return;
        const data = (await res.json()).data;
        document.getElementById('statTotalDead').textContent = data.totalDead;
        document.getElementById('statRecentDead').textContent = data.recentDead24h;
        document.getElementById('statTopError').textContent = data.byError?.[0]?._id || 'None';
        document.getElementById('statOldestJob').textContent = data.oldestJob?.updatedAt
          ? new Date(data.oldestJob.updatedAt).toLocaleString()
          : 'None';
      } catch (err) {
        console.error('Stats error', err);
      }
    }

    async function loadDeadJobs() {
      const tbody = document.getElementById('deadJobsTableBody');
      const type = document.getElementById('typeFilter').value;
      const query = type ? '?type=' + type : '';

      try {
        const res = await apiRequest('/dead-letter-jobs' + query);
        if (res.status === 401 || res.status === 403) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #f87171; padding: 24px;">🔒 401/403 Unauthorized: Please provide a valid ADMIN JWT token above.</td></tr>';
          return;
        }

        const data = (await res.json()).data;
        if (!data || data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #4ade80; padding: 32px;">🎉 No dead-letter jobs! The queue is clean and healthy.</td></tr>';
          return;
        }

        tbody.innerHTML = data.map(j => {
          const userEmail = j.userId?.email || 'N/A';
          const failedAt = new Date(j.updatedAt).toLocaleTimeString();
          return '<tr>' +
            '<td><code style="color: #38bdf8;">' + j.jobId.slice(0, 8) + '...</code></td>' +
            '<td><span class="badge badge-type">' + j.type + '</span></td>' +
            '<td>' + j.attempts + ' / ' + j.maxAttempts + '</td>' +
            '<td><div class="error-text" title="' + (j.error || '') + '">' + (j.error || 'Unknown failure') + '</div></td>' +
            '<td>' + failedAt + '</td>' +
            '<td style="text-align: right; white-space: nowrap;">' +
              '<button class="btn btn-secondary" style="margin-right: 6px;" onclick="viewHistory(\'' + j.jobId + '\')">🔍 History</button>' +
              '<button class="btn btn-success" style="margin-right: 6px;" onclick="retryJob(\'' + j.jobId + '\')">🔄 Retry</button>' +
              '<button class="btn btn-danger" onclick="purgeJob(\'' + j.jobId + '\')">🗑️ Purge</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ef4444; padding: 24px;">Failed to load dead jobs: ' + err.message + '</td></tr>';
      }
    }

    async function retryJob(jobId) {
      if (!confirm('Re-queue dead job ' + jobId + ' back into BullMQ?')) return;
      try {
        const res = await apiRequest('/dead-letter-jobs/' + jobId + '/retry', { method: 'POST' });
        const json = await res.json();
        if (res.ok) {
          showToast('Job ' + jobId.slice(0, 8) + ' re-queued successfully!');
          loadDashboard();
        } else {
          showToast(json.error || 'Retry failed', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function retryAllJobs() {
      const type = document.getElementById('typeFilter').value;
      const typeLabel = type ? ' (' + type + ')' : ' (ALL)';
      if (!confirm('Bulk retry all dead jobs' + typeLabel + '? This resets attempt counters and re-enqueues them.')) return;

      try {
        const res = await apiRequest('/dead-letter-jobs/retry-all', {
          method: 'POST',
          body: JSON.stringify(type ? { type } : {})
        });
        const json = await res.json();
        if (res.ok) {
          showToast('Successfully re-queued ' + json.data.requeued + ' dead jobs!');
          loadDashboard();
        } else {
          showToast(json.error || 'Bulk retry failed', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function purgeJob(jobId) {
      if (!confirm('Permanently purge dead job ' + jobId + '? This action cannot be undone.')) return;
      try {
        const res = await apiRequest('/dead-letter-jobs/' + jobId, { method: 'DELETE' });
        const json = await res.json();
        if (res.ok) {
          showToast('Job purged permanently');
          loadDashboard();
        } else {
          showToast(json.error || 'Purge failed', true);
        }
      } catch (err) {
        showToast(err.message, true);
      }
    }

    async function viewHistory(jobId) {
      const modal = document.getElementById('modal');
      const body = document.getElementById('modalBody');
      const title = document.getElementById('modalTitle');
      title.textContent = 'Audit History: ' + jobId;
      body.innerHTML = 'Loading audit history...';
      modal.style.display = 'flex';

      try {
        const res = await apiRequest('/dead-letter-jobs/' + jobId);
        const json = await res.json();
        if (res.ok) {
          const job = json.data;
          let html = '<div style="margin-bottom: 8px;"><b>Type:</b> ' + job.type + ' | <b>Attempts:</b> ' + job.attempts + '</div>';
          html += '<div><b>Failure History Log:</b></div>';
          html += '<pre>' + JSON.stringify(job.errorHistory || [], null, 2) + '</pre>';
          html += '<div style="margin-top: 12px;"><b>Job Payload:</b></div>';
          html += '<pre>' + JSON.stringify(job.payload || {}, null, 2) + '</pre>';
          body.innerHTML = html;
        } else {
          body.innerHTML = '<div style="color: #ef4444;">' + (json.error || 'Failed to load job details') + '</div>';
        }
      } catch (err) {
        body.innerHTML = '<div style="color: #ef4444;">Error: ' + err.message + '</div>';
      }
    }

    function closeModal() {
      document.getElementById('modal').style.display = 'none';
    }

    function loadDashboard() {
      loadStats();
      loadDeadJobs();
    }

    loadDashboard();
  </script>
</body>
</html>`;
}
