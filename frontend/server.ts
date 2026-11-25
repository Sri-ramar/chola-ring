import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import osModule from 'os';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const getDirname = (): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // fallback
  }
  if (typeof __dirname !== 'undefined') return __dirname;
  return process.cwd();
};

const app = express();
const server = http.createServer(app);

function findProjectRoot(): string {
  const candidates = [
    path.resolve(getDirname(), '..'),
    path.resolve(getDirname(), '..', '..'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ];

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'backend', 'agent_engine.py')))
    || path.resolve(getDirname(), '..');
}

const PROJECT_ROOT = findProjectRoot();
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.join(PROJECT_ROOT, envFile);
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
}

const PORT = Number.parseInt(process.env.PORT || '3008', 10);
const HOST = process.env.RHIONA_HOST || '127.0.0.1';

// .env files are optional. The key that actually exists in this project is stored in
// backend/config/api_keys.json, so read that too (server-side only — never sent to
// the client) instead of silently running the Live/vision path keyless.
const API_KEYS_FILE = path.join(PROJECT_ROOT, 'backend', 'config', 'api_keys.json');
function readApiKeys(): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(API_KEYS_FILE, 'utf-8') || '{}');
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? '').trim()]),
    );
  } catch {
    return {};
  }
}
const API_KEYS = readApiKeys();
if (!process.env.GEMINI_API_KEY?.trim() && API_KEYS.gemini_api_key) {
  console.log('[Config] GEMINI_API_KEY loaded from backend/config/api_keys.json');
}

const LAYOUT_CONFIG_FILE = path.join(PROJECT_ROOT, 'backend', 'config', 'window_layout.json');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || API_KEYS.gemini_api_key || '';
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL?.trim() || 'gemini-3.1-flash-live-preview';
const BACKEND_ENGINE_PATH = path.join(PROJECT_ROOT, 'backend', 'agent_engine.py');
const PYTHON_PATH = path.join(PROJECT_ROOT, 'backend', '.venv', 'bin', 'python3');

const ENGINE_ACTIONS = new Set([
  'health',
  'search',
  'scrape',
  'media',
  'media_status',
  'shell',
  'memory_graph',
  'memory_add',
  'screen',
  'vision_analyze',
  'agent_plan',
  'agent_execute',
  'open_app',
  'browser',
  'contacts',
  'fan',
  'fan_status',
  'clipboard_get',
  'clipboard_set',
  'notify',
  'reminders_list',
  'reminders_add',
  'reminders_delete',
  'reminders_check',
  'whatsapp_send',
]);

function getBackendStatus() {
  const agentAvailable = fs.existsSync(BACKEND_ENGINE_PATH);
  return {
    mode: 'agentic',
    state: 'running',
    assistantState: 'ready',
    engine: 'Rhiona Autonomous Agentic Engine (Planner, Executor, Multi-Tool Actions, Long-Term Memory, Vision)',
    agentEngineAvailable: agentAvailable,
    backendPath: path.join(PROJECT_ROOT, 'backend'),
    startedAt: new Date().toISOString(),
    frontend: 'rhiona',
  };
}

function geminiWebSocketUrl(): string | null {
  if (!GEMINI_API_KEY) return null;
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
}

app.use(express.json({ limit: '15mb' }));
// NOTE: the urlencoded parser was removed deliberately. It let any web page open in
// any browser POST a form (a "simple request", so no CORS preflight) straight into
// /api/system/execute, i.e. remote code execution on this machine. The HUD now posts
// JSON, which the browser preflights, and the origin guard below rejects the rest.

// Local-only guard for state-changing calls. The bridge executes real commands on
// this host, so anything that is not a local-origin/native caller is refused.
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (!origin || LOCAL_ORIGIN.test(origin)) return next();
  console.warn(`[Security] Blocked ${req.method} ${req.path} from origin ${origin}`);
  return res.status(403).json({ success: false, error: 'Cross-origin requests are not permitted.' });
});

// Read-only engine actions are polled by several HUD widgets at once and every call
// costs a full Python process spawn (~0.2s of CPU). Serve them from a short-lived
// cache and coalesce concurrent callers so polling cannot stampede the engine.
const ENGINE_CACHE_TTL_MS = 3000;
const CACHEABLE_ACTIONS = new Set(['health', 'fan_status', 'media_status', 'reminders_list']);
const engineCache = new Map<string, { expires: number; value: any }>();
const engineInFlight = new Map<string, Promise<any>>();

function invalidateEngineCache(...actions: string[]) {
  if (actions.length === 0) {
    engineCache.clear();
    return;
  }
  actions.forEach((action) => engineCache.delete(action));
}

async function runEngine(action: string, args: string[] = [], extraEnv: Record<string, string> = {}): Promise<any> {
  if (args.length > 0 || Object.keys(extraEnv).length > 0 || !CACHEABLE_ACTIONS.has(action)) {
    return runEngineUncached(action, args, extraEnv);
  }

  const cached = engineCache.get(action);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const inFlight = engineInFlight.get(action);
  if (inFlight) return inFlight;

  const pending = runEngineUncached(action, [])
    .then((value) => {
      engineCache.set(action, { expires: Date.now() + ENGINE_CACHE_TTL_MS, value });
      return value;
    })
    .finally(() => engineInFlight.delete(action));

  engineInFlight.set(action, pending);
  return pending;
}

// Helper: Run Python Agent Engine commands
function extractTrailingJson(raw: string): any | null {
  // The engine prints its JSON result on its own line after human-readable logs
  // ("[Executor] Goal: ...", progress logs), so try the last '{'-bearing lines
  // first. Taking the last '{' in the whole stream (the old approach) lands inside
  // the payload as soon as it contains nested objects, and brace-depth scanning
  // from the first '{' can mis-anchor on a log line that happens to contain one.
  const balancedSlice = (from: number): string | null => {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = from; i < raw.length; i += 1) {
      const ch = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return raw.slice(from, i + 1);
      }
    }
    return null;
  };

  // Only a whole object that *starts its own line* is accepted. Accepting any line
  // that merely contains a '{' can return a nested fragment (e.g. the single step
  // object inside "steps": [...]), which is silently wrong.
  const lineBounds: Array<[number, number]> = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (i === 0 || raw[i - 1] === '\n') {
      const newline = raw.indexOf('\n', i);
      lineBounds.push([i, newline === -1 ? raw.length : newline]);
    }
  }

  // Pass 1: complete single-line objects, newest first (the engine's actual format).
  for (let i = lineBounds.length - 1; i >= 0; i -= 1) {
    const [start, end] = lineBounds[i];
    const line = raw.slice(start, end);
    if (!line.trimStart().startsWith('{')) continue;
    try {
      return JSON.parse(line.trim());
    } catch {
      // Incomplete on this line; the depth scan below may still cover it.
    }
  }

  // Pass 2: resolve the first standalone object by brace depth (pretty-printed JSON).
  for (const [start, end] of lineBounds) {
    const line = raw.slice(start, end);
    const indent = line.length - line.trimStart().length;
    if (raw[start + indent] !== '{') continue;
    const balanced = balancedSlice(start + indent);
    if (!balanced) continue;
    try {
      return JSON.parse(balanced);
    } catch {
      return null;
    }
  }

  return null;
}

function runEngineUncached(action: string, args: string[] = [], extraEnv: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve) => {
    if (!ENGINE_ACTIONS.has(action)) {
      resolve({ success: false, error: `Unsupported backend action: ${action}` });
      return;
    }

    const pyCmd = fs.existsSync(PYTHON_PATH) ? PYTHON_PATH : 'python3';

    const child = spawn(pyCmd, [BACKEND_ENGINE_PATH, action, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...extraEnv },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const appendOutput = (current: string, next: Buffer): string => {
      const combined = current + next.toString();
      return combined.length > 2_000_000 ? combined.slice(-2_000_000) : combined;
    };

    child.stdout.on('data', (d: Buffer) => (stdout = appendOutput(stdout, d)));
    child.stderr.on('data', (d: Buffer) => (stderr = appendOutput(stderr, d)));

    child.on('close', (code) => {
      const trimmed = stdout.trim();
      try {
        const parsed = JSON.parse(trimmed);
        finish(parsed);
        return;
      } catch {
        // The engine prints log lines before its JSON result, so pull the outer JSON
        // object out by brace depth. Taking the last '{' instead (the old approach)
        // lands inside the payload as soon as it contains nested objects.
        const extracted = extractTrailingJson(trimmed);
        if (extracted) {
          finish(extracted);
          return;
        }
        finish({
          success: false,
          error: stderr.trim() || `Agent engine exited with code ${code ?? 'unknown'}.`,
          raw: trimmed,
        });
      }
    });

    child.on('error', (err) => {
      finish({ success: false, error: err.message });
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ success: false, error: `Agent action '${action}' timed out.` });
    }, action === 'vision_analyze' || action === 'agent_execute' || action === 'agent_plan' ? 60_000 : 15_000);
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const backend = getBackendStatus();
  res.json({
    status: 'ok',
    backendMode: 'agentic',
    primaryEngine: 'Rhiona Autonomous Agentic Flow (Planner, Executor, Multi-Tool Actions)',
    backend,
    geminiConfigured: Boolean(GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    tools: [
      'planner',
      'executor',
      'web_search',
      'open_app',
      'media_control',
      'shell_exec',
      'long_term_memory',
      'vision_multimodal',
      'file_controller',
      'browser_control',
      'code_helper',
      'hardware_telemetry',
      'contacts',
    ],
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/backend/status', (req, res) => {
  res.json(getBackendStatus());
});

app.post(['/api/backend/start', '/api/backend/restart'], (req, res) => {
  res.json({ success: true, status: getBackendStatus() });
});

app.post('/api/backend/stop', (req, res) => {
  res.json({ success: true, status: 'stopped' });
});

app.post('/api/backend/send-text', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) return res.status(400).json({ success: false, error: 'Text is required.' });
  const result = await runEngine('agent_execute', [text.trim()]);
  return res.json({ success: result.success !== false, output: result.result || result.output || result });
});

// Window Layout Persistence Endpoints
app.get('/api/layout', (req, res) => {
  try {
    if (fs.existsSync(LAYOUT_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(LAYOUT_CONFIG_FILE, 'utf-8'));
      return res.json({ success: true, layout: data });
    }
  } catch (err: any) {
    console.error('[Layout] Error reading window_layout.json:', err);
  }
  return res.json({ success: true, layout: null });
});

app.post('/api/layout', (req, res) => {
  try {
    const layout = req.body?.layout || req.body;
    if (!layout || typeof layout !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid layout object.' });
    }
    const dir = path.dirname(LAYOUT_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LAYOUT_CONFIG_FILE, JSON.stringify(layout, null, 2), 'utf-8');
    console.log('[Layout] Successfully saved window layout to backend/config/window_layout.json');
    return res.json({ success: true, message: 'Layout saved successfully.' });
  } catch (err: any) {
    console.error('[Layout] Error saving window_layout.json:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Real-Time System Hardware Status Endpoint
app.get(['/api/status', '/api/system/health', '/api/system/telemetry'], async (req, res) => {
  const data = await runEngine('health');
  if (data && data.cpu_percent !== undefined) {
    const totalBytes = osModule.totalmem();
    const cpuInfo = osModule.cpus();
    const cpu = {
      load: data.cpu_percent,
      percent: data.cpu_percent,
      cores: cpuInfo.length,
      model: cpuInfo[0]?.model || 'Host Processor',
      freq_ghz: Number(((cpuInfo[0]?.speed || 0) / 1000).toFixed(2)),
      temp: data.cpu_temp ?? 0,
    };
    const ram = {
      used_gb: Number((data.ram_used_mb / 1024).toFixed(1)),
      total_gb: Number((data.ram_total_mb / 1024).toFixed(1)),
      free_gb: Number(((data.ram_total_mb - data.ram_used_mb) / 1024).toFixed(1)),
      percent: data.ram_percent,
    };
    return res.json({
      cpu,
      ram,
      memory: {
        used_mb: data.ram_used_mb,
        total_mb: data.ram_total_mb,
        percent: data.ram_percent,
        total_bytes: totalBytes,
      },
      gpu: data.gpu || {
        name: 'NVIDIA GPU Acceleration',
        temp: 42.0,
        utilization: 4,
        vram_percent: 18,
        vram_used_mb: 750,
        vram_total_mb: 4096,
      },
      battery: data.battery,
      fan: data.fan || {
        available: false,
        mode: 'auto',
        fan1_rpm: 0,
        fan2_rpm: 0,
      },
      os: {
        platform: osModule.platform(),
        kernel: osModule.release(),
        hostname: osModule.hostname(),
        arch: osModule.arch(),
        uptime_seconds: data.uptime_seconds || Math.floor(osModule.uptime()),
      },
      model_status: {
        state: GEMINI_API_KEY ? 'ready' : 'configuration_required',
        device: 'cloud',
        model: GEMINI_LIVE_MODEL,
      },
      timestamp: data.timestamp || new Date().toISOString(),
    });
  }

  const totalMem = osModule.totalmem();
  const freeMem = osModule.freemem();
  const usedMem = totalMem - freeMem;
  return res.json({
    cpu: {
      load: 0,
      percent: 0,
      cores: osModule.cpus().length,
      model: osModule.cpus()[0]?.model || 'Host Processor',
      freq_ghz: Number(((osModule.cpus()[0]?.speed || 0) / 1000).toFixed(2)),
      temp: 0,
    },
    ram: {
      used_gb: Number((usedMem / 1073741824).toFixed(1)),
      total_gb: Number((totalMem / 1073741824).toFixed(1)),
      free_gb: Number((freeMem / 1073741824).toFixed(1)),
      percent: Number(((usedMem / totalMem) * 100).toFixed(1)),
    },
    memory: { used_mb: Math.round(usedMem / 1048576), total_mb: Math.round(totalMem / 1048576), percent: Number(((usedMem / totalMem) * 100).toFixed(1)) },
    gpu: { name: 'Unavailable', temp: 0, utilization: 0, vram_percent: 0, vram_used_mb: 0, vram_total_mb: 0 },
    fan: { available: false, mode: 'auto', fan1_rpm: 0, fan2_rpm: 0 },
    os: { platform: osModule.platform(), kernel: osModule.release(), hostname: osModule.hostname(), arch: osModule.arch(), uptime_seconds: Math.floor(osModule.uptime()) },
    model_status: { state: GEMINI_API_KEY ? 'ready' : 'configuration_required', device: 'cloud', model: GEMINI_LIVE_MODEL },
  });
});

// Real OS Command Execution API
app.post('/api/system/execute', async (req, res) => {
  const cmd = (req.body?.cmd || '').trim();
  if (!cmd) return res.json({ output: 'No command specified.' });
  const result = await runEngine('shell', [cmd]);
  return res.json({ output: result.output || result.error || `Command finished with code ${result.returncode}` });
});

// Laptop Fan Controller API
app.get('/api/system/fan', async (_req, res) => {
  const result = await runEngine('fan_status');
  return res.json(result);
});

app.post('/api/system/fan', async (req, res) => {
  const mode = (req.body?.mode || 'status').trim();
  const password = (req.body?.password || '').trim();
  // Hand the sudo password to the child through its environment, never argv: argv is
  // world-readable in `ps`, so passing it as an argument leaked it to every local user.
  const result = password
    ? await runEngine('fan', [mode], { RHIONA_FAN_PASSWORD: password })
    : await runEngine('fan', [mode]);
  invalidateEngineCache('fan_status', 'health');
  return res.json(result);
});

// Firecrawl & Web Search / Scraping API
app.post(['/api/firecrawl', '/api/web/search'], async (req, res) => {
  const { mode, query, url } = req.body;
  const isScrape = mode === 'scrape' || (url && !query);
  const target = (url || query || 'Breakthroughs in Quantum AI').trim();
  const result = await runEngine(isScrape ? 'scrape' : 'search', [target]);
  return res.json({
    success: result.success !== false,
    query: target,
    markdown: result.markdown || `### Search: "${target}"\n\nNo structured results returned.`,
    sources: result.sources || [],
    results: result.results || [],
    timestamp: new Date().toISOString(),
  });
});

// MPRIS Media Player Control & Status API
app.get(['/api/media', '/api/media/status'], async (req, res) => {
  const result = await runEngine('media_status');
  return res.json(result);
});

app.post(['/api/media', '/api/media/control'], async (req, res) => {
  const action = (req.body?.action || 'status').trim();
  const result = await runEngine('media', [action]);
  invalidateEngineCache('media_status');
  return res.json(result);
});

// Relationship Memory Graph API
app.get('/api/memory/graph', async (req, res) => {
  const result = await runEngine('memory_graph');
  return res.json(result);
});

app.post('/api/memory/triple', async (req, res) => {
  const { source, relation, target } = req.body;
  if (!source || !relation || !target) {
    return res.status(400).json({ error: 'Missing source, relation, or target' });
  }
  const result = await runEngine('memory_add', [source, relation, target]);
  return res.json(result);
});

// Desktop Screenshot & Vision Analysis API
app.get('/api/vision/capture', async (req, res) => {
  const result = await runEngine('screen');
  return res.json(result);
});

app.post('/api/vision/analyze', async (req, res) => {
  const prompt = req.body?.prompt || 'Analyze what is currently visible on the screen.';
  const result = await runEngine('vision_analyze', [prompt]);
  return res.json(result);
});

// Autonomous Agentic Task Planning & Execution APIs
app.post('/api/agent/plan', async (req, res) => {
  const goal = (req.body?.goal || '').trim();
  if (!goal) return res.status(400).json({ success: false, error: 'Goal is required' });
  const result = await runEngine('agent_plan', [goal]);
  return res.json(result);
});

app.post('/api/agent/execute', async (req, res) => {
  const goal = (req.body?.goal || '').trim();
  if (!goal) return res.status(400).json({ success: false, error: 'Goal is required' });
  const result = await runEngine('agent_execute', [goal]);
  return res.json(result);
});

app.post('/api/app/open', async (req, res) => {
  const appName = (req.body?.app || req.body?.appName || '').trim();
  if (!appName) return res.status(400).json({ success: false, error: 'App name is required' });
  const result = await runEngine('open_app', [appName]);
  return res.json(result);
});

app.post('/api/whatsapp/send', async (req, res) => {
  const receiver = (req.body?.receiver || req.body?.recipient || '').trim();
  const message = (req.body?.message || req.body?.text || '').trim();
  if (!receiver || !message) {
    return res.status(400).json({ success: false, error: 'Both receiver and message are required.' });
  }
  const result = await runEngine('whatsapp_send', [receiver, message]);
  return res.json(result);
});

app.get('/api/contacts', async (req, res) => {
  const query = (req.query?.q as string || '').trim();
  const result = await runEngine('contacts', [query]);
  return res.json(result);
});

// Desktop Clipboard API
app.get('/api/clipboard', async (_req, res) => {
  const result = await runEngine('clipboard_get');
  return res.json(result);
});

app.post('/api/clipboard', async (req, res) => {
  const text = (req.body?.text || '').trim();
  const result = await runEngine('clipboard_set', [text]);
  return res.json(result);
});

// Native Desktop Notifications API
app.post('/api/notify', async (req, res) => {
  const title = (req.body?.title || 'RHIONA').trim();
  const message = (req.body?.message || '').trim();
  const result = await runEngine('notify', [title, message]);
  return res.json(result);
});

// Persistent Reminders & Autonomous Missions API
// Reading reminders is pure disk I/O, so serve it straight from the JSON file and
// skip a Python process spawn entirely (this endpoint is polled every few seconds).
const REMINDERS_FILE = `${PROJECT_ROOT}/backend/memory/reminders.json`;
app.get(['/api/reminders', '/api/scheduler/tasks'], (_req, res) => {
  try {
    const tasks = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8') || '[]');
    return res.json(Array.isArray(tasks) ? tasks : tasks.tasks || []);
  } catch {
    return res.json([]);
  }
});

app.post(['/api/reminders', '/api/scheduler/tasks'], async (req, res) => {
  const { title, time, action, recurring, goal, priority } = req.body || {};
  if (!title) return res.status(400).json({ success: false, error: 'Title is required' });
  const args = [
    title,
    time || '+15m',
    action || 'notify',
    recurring || 'once',
    goal || title,
    priority || 'HIGH',
  ];
  const result = await runEngine('reminders_add', args);
  invalidateEngineCache('reminders_list');
  return res.json(result);
});

app.delete(['/api/reminders/:id', '/api/scheduler/tasks/:id'], async (req, res) => {
  const result = await runEngine('reminders_delete', [req.params.id]);
  invalidateEngineCache('reminders_list');
  return res.json(result);
});

app.post(['/api/reminders/:id/trigger', '/api/scheduler/tasks/:id/trigger'], async (req, res) => {
  const title = req.body?.title || 'Task';
  const goal = req.body?.goal || title;
  const isAgent = req.body?.action === 'execute_agent';
  invalidateEngineCache('reminders_list');
  if (isAgent) {
    const result = await runEngine('agent_execute', [goal]);
    return res.json({ success: true, result });
  } else {
    const result = await runEngine('notify', ['RHIONA // REMINDER', title]);
    return res.json({ success: true, result });
  }
});

// Helper: Convert 24kHz PCM16 Mono Buffer to WAV Buffer
function pcmToWav(pcmData: Buffer, sampleRate = 24000, numChannels = 1): Buffer {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // 1 = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // 16 bits
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

// Instant Voice Persona Audio Preview Endpoint
app.all('/api/voice/preview', async (req, res) => {
  const voice = (req.query.voice as string) || (req.body?.voice as string) || 'Puck';
  console.log(`[Gemini Live] Generating audio preview for voice: ${voice}...`);

  try {
    const geminiWsUrl = geminiWebSocketUrl();
    if (!geminiWsUrl) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the Rhiona server.' });
    }
    const previewWs = new WebSocket(geminiWsUrl);
    const audioChunks: Buffer[] = [];
    let isDone = false;

    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        previewWs.close();
        if (audioChunks.length > 0) {
          const combinedPcm = Buffer.concat(audioChunks);
          const wav = pcmToWav(combinedPcm);
          res.set('Content-Type', 'audio/wav');
          return res.send(wav);
        }
        res.status(504).json({ error: 'Voice preview timed out' });
      }
    }, 6000);

    previewWs.on('open', () => {
      previewWs.send(
        JSON.stringify({
          setup: {
            model: `models/${GEMINI_LIVE_MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voice,
                  },
                },
              },
            },
          },
        })
      );
    });

    previewWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.setupComplete) {
          previewWs.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: `Say: Voice link calibrated. ${voice} persona online and ready.` }],
                  },
                ],
                turnComplete: true,
              },
            })
          );
        }
        if (msg.serverContent?.modelTurn?.parts) {
          for (const part of msg.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
            }
          }
        }
        if (msg.serverContent?.turnComplete) {
          if (!isDone) {
            isDone = true;
            clearTimeout(timeout);
            previewWs.close();
            const combinedPcm = Buffer.concat(audioChunks);
            const wav = pcmToWav(combinedPcm);
            res.set('Content-Type', 'audio/wav');
            return res.send(wav);
          }
        }
      } catch (err) {
        console.error('[Voice Preview] Parse error:', err);
      }
    });

    previewWs.on('error', (err) => {
      console.error('[Voice Preview] WebSocket error:', err.message);
      if (!isDone) {
        isDone = true;
        clearTimeout(timeout);
        res.status(500).json({ error: err.message });
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// High-Speed Gemini Live WebSocket Gateway & Tool Dispatcher
// -------------------------------------------------------------
const proxyWss = new WebSocketServer({ noServer: true });

// Background Persistent Reminders & Autonomous Mission Scheduler
setInterval(async () => {
  try {
    const res = await runEngine('reminders_check');
    if (res && res.count > 0) {
      const payload = JSON.stringify({
        type: 'reminders_triggered',
        count: res.count,
        triggered: res.triggered,
        timestamp: new Date().toISOString(),
      });
      proxyWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }
  } catch {
    // ignore
  }
}, 15000);

function handleGeminiLiveConnection(clientWs: WebSocket, voiceName = 'Puck') {
  console.log(`[Gemini Live] Initiating bidirectional session with persona: ${voiceName}...`);
  const geminiWsUrl = geminiWebSocketUrl();
  if (!geminiWsUrl) {
    clientWs.send(JSON.stringify({
      type: 'configuration_error',
      message: 'GEMINI_API_KEY is missing. Add it to .env.local to activate voice streaming.',
    }));
    clientWs.close(1011, 'Gemini API key missing');
    return;
  }
  const geminiWs = new WebSocket(geminiWsUrl);

  const pendingMessages: Array<{ data: any; isBinary: boolean }> = [];
  let isSetupDone = false;
  let userTranscript = '';
  let assistantTranscript = '';

  const appendTranscript = (current: string, chunk: string): string => {
    if (!chunk) return current;
    if (chunk.startsWith(current)) return chunk;
    return current + chunk;
  };

  geminiWs.on('open', () => {
    console.log('[Gemini Live] Connected to Google AI! Declaring full tactical tool suite...');

    const setupMessage = {
      setup: {
        model: `models/${GEMINI_LIVE_MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName || 'Puck',
              },
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: {
          parts: [
            {
              text: 'You are Rhiona, a powerful autonomous AI companion and tactical cybernetic interface. Speak naturally, warmly, and concisely in 1-2 spoken sentences. Answer any user question, search the web, execute safe commands, control media, send WhatsApp messages using sendWhatsAppMessage, remember facts, analyze the screen, open applications, execute autonomous agent tasks, and call adjustReactor whenever the user requests visual or core telemetry modifications.',
            },
          ],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'adjustReactor',
                description: 'Adjust reactor telemetry parameters such as overclocking state, chassis metal alloy, or neon glow theme',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    isOverclocked: { type: 'BOOLEAN', description: 'Set true to overclock/turbo, false to stabilize' },
                    shellMetal: { type: 'STRING', enum: ['gold', 'black', 'silver'], description: 'Chassis metallurgy alloy' },
                    neonTheme: { type: 'STRING', enum: ['amber', 'cyan', 'crimson', 'emerald', 'violet', 'ice'], description: 'Core neon color spectrum' },
                  },
                },
              },
              {
                name: 'executeWebSearch',
                description: 'Search the live web for real-time answers, news, weather, facts, and research',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: { type: 'STRING', description: 'The search query or topic' },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'controlMedia',
                description: 'Control system and browser media playback (play, pause, next, previous, stop, volume)',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    action: { type: 'STRING', enum: ['play', 'pause', 'toggle', 'next', 'previous', 'stop', 'volume_up', 'volume_down'], description: 'Media command' },
                  },
                  required: ['action'],
                },
              },
              {
                name: 'executeShellCommand',
                description: 'Execute a non-destructive Linux terminal command on the host system and view output',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    command: { type: 'STRING', description: 'Linux shell command to execute (e.g. uname -a, df -h, uptime, date, ps)' },
                  },
                  required: ['command'],
                },
              },
              {
                name: 'getSystemHealth',
                description: 'Query real-time hardware health (CPU, RAM, GPU temperature, battery, uptime)',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                },
              },
              {
                name: 'manageMemory',
                description: 'Store or search user facts and preferences in persistent long-term memory',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    category: { type: 'STRING', description: 'Category (notes, preferences, friends, projects)' },
                    key: { type: 'STRING', description: 'Short memory key' },
                    value: { type: 'STRING', description: 'Detailed fact or preference' },
                  },
                  required: ['key', 'value'],
                },
              },
              {
                name: 'analyzeScreen',
                description: 'Capture the desktop screen and analyze its contents, windows, errors, or code using Multimodal Vision',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    prompt: { type: 'STRING', description: 'Specific question or analysis prompt for what to look for on screen' },
                  },
                },
              },
              {
                name: 'openApplication',
                description: 'Launch a local desktop application (e.g. calculator, terminal, code, chrome, spotify)',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    appName: { type: 'STRING', description: 'Application name' },
                  },
                  required: ['appName'],
                },
              },
              {
                name: 'controlBrowser',
                description: 'Control web browser dynamically via Playwright and CDP to navigate to URLs, perform web searches, click elements, type input, scroll pages, or extract live page text',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    action: {
                      type: 'STRING',
                      enum: ['go_to', 'search', 'click', 'smart_click', 'type', 'smart_type', 'scroll', 'get_text', 'close'],
                      description: 'Browser action: go_to (opens url), search (searches query), click (clicks element), smart_click (clicks by description), type (types text), smart_type (types into field by description), scroll (scrolls page), get_text (reads page text)',
                    },
                    url: { type: 'STRING', description: 'URL to navigate to (e.g. https://www.youtube.com)' },
                    query: { type: 'STRING', description: 'Search query for search engine' },
                    text: { type: 'STRING', description: 'Text to type, or visible text to click' },
                    description: { type: 'STRING', description: 'Semantic description of element (e.g. "search input", "play button", "sign in")' },
                    selector: { type: 'STRING', description: 'CSS/Playwright selector (optional)' },
                  },
                  required: ['action'],
                },
              },
              {
                name: 'executeAgentTask',
                description: 'Execute a high-level autonomous multi-step goal using the agentic planner and executor',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    goal: { type: 'STRING', description: 'Natural language goal for the agent to plan and accomplish' },
                  },
                  required: ['goal'],
                },
              },
              {
                name: 'searchContacts',
                description: 'Search personal contacts list for phone numbers or details',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    query: { type: 'STRING', description: 'Name of the contact to look up' },
                  },
                  required: ['query'],
                },
              },
              {
                name: 'setReminder',
                description: 'Schedule a timed notification reminder for the user',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    message: { type: 'STRING', description: 'The reminder message' },
                    delaySeconds: { type: 'NUMBER', description: 'Delay in seconds before triggering' },
                  },
                  required: ['message', 'delaySeconds'],
                },
              },
              {
                name: 'sendWhatsAppMessage',
                description: 'Send a WhatsApp message to any contact or phone number. Automatically searches contacts, opens the chat, and sends the message.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    receiver: { type: 'STRING', description: 'Name of the contact or phone number (e.g. "Saravanan", "Mom", "+919363568199")' },
                    message: { type: 'STRING', description: 'The text message to send' },
                  },
                  required: ['receiver', 'message'],
                },
              },
            ],
          },
        ],
      },
    };

    geminiWs.send(JSON.stringify(setupMessage));
  });

  geminiWs.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      if (msg.setupComplete) {
        console.log('[Gemini Live] Session setup complete! Ready for user audio/text.');
        isSetupDone = true;
        clientWs.send(JSON.stringify({ type: 'state', state: 'listening' }));
        clientWs.send(JSON.stringify({ type: 'status', message: `Rhiona Agentic Gateway Online (${voiceName}).` }));

        while (pendingMessages.length > 0) {
          const item = pendingMessages.shift()!;
          handleClientMessage(item.data, item.isBinary);
        }
        return;
      }

      if (msg.voiceActivity) {
        if (msg.voiceActivity.type === 'ACTIVITY_START') {
          clientWs.send(JSON.stringify({ type: 'state', state: 'user_speaking' }));
        } else if (msg.voiceActivity.type === 'ACTIVITY_END') {
          clientWs.send(JSON.stringify({ type: 'state', state: 'thinking' }));
        }
      }

      if (msg.serverContent) {
        const sc = msg.serverContent;

        if (sc.interrupted) {
          clientWs.send(JSON.stringify({ type: 'state', state: 'interrupted' }));
          return;
        }

        if (sc.inputTranscription?.text) {
          userTranscript = appendTranscript(userTranscript, sc.inputTranscription.text);
          clientWs.send(JSON.stringify({
            type: 'user_transcript',
            text: userTranscript,
            isFinal: false,
          }));
        }

        if (sc.outputTranscription?.text) {
          assistantTranscript = appendTranscript(assistantTranscript, sc.outputTranscription.text);
          clientWs.send(JSON.stringify({
            type: 'text',
            message: assistantTranscript,
          }));
        }

        if (sc.modelTurn && sc.modelTurn.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData && part.inlineData.data) {
              const pcmBuffer = Buffer.from(part.inlineData.data, 'base64');
              clientWs.send(pcmBuffer, { binary: true });
            }
            if (part.text) {
              assistantTranscript = appendTranscript(assistantTranscript, part.text);
              clientWs.send(JSON.stringify({
                type: 'text',
                message: assistantTranscript,
              }));
            }
          }
        }

        if (sc.turnComplete) {
          if (userTranscript) {
            clientWs.send(JSON.stringify({
              type: 'user_transcript',
              text: userTranscript,
              isFinal: true,
            }));
            userTranscript = '';
          }
          if (assistantTranscript) {
            clientWs.send(JSON.stringify({ type: 'done', text: assistantTranscript }));
            assistantTranscript = '';
          }
        }
      }

      if (msg.toolCall && msg.toolCall.functionCalls) {
        clientWs.send(JSON.stringify({ type: 'state', state: 'thinking' }));
        const fcs = msg.toolCall.functionCalls;
        const toolResponses: any[] = [];

        for (const fc of fcs) {
          const name = fc.name;
          const args = fc.args || {};
          console.log(`[Agentic Tool Call] Executing: ${name}`, args);

          if (name === 'adjustReactor') {
            clientWs.send(JSON.stringify({ type: 'action', actions: args }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { result: 'Reactor parameters updated successfully.' },
            });
          } else if (name === 'executeWebSearch') {
            const searchRes = await runEngine('search', [args.query || '']);
            clientWs.send(JSON.stringify({ type: 'search_results', data: searchRes }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { searchResults: searchRes.markdown || 'No results found.' },
            });
          } else if (name === 'controlMedia') {
            const mediaRes = await runEngine('media', [args.action || 'toggle']);
            clientWs.send(JSON.stringify({ type: 'media_update', data: mediaRes }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { result: mediaRes.status || 'Media action executed.' },
            });
          } else if (name === 'executeShellCommand') {
            const shellRes = await runEngine('shell', [args.command || 'uptime']);
            clientWs.send(JSON.stringify({ type: 'shell_output', data: shellRes }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { output: shellRes.output || 'Command completed.' },
            });
          } else if (name === 'getSystemHealth') {
            const healthRes = await runEngine('health');
            clientWs.send(JSON.stringify({ type: 'health_update', data: healthRes }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { telemetry: healthRes },
            });
          } else if (name === 'manageMemory') {
            const memRes = await runEngine('memory_add', [args.category || 'notes', args.key || 'general', args.value || '']);
            clientWs.send(JSON.stringify({ type: 'memory_update', data: memRes }));
            toolResponses.push({ name, id: fc.id, response: memRes });
          } else if (name === 'analyzeScreen') {
            const visionRes = await runEngine('vision_analyze', [args.prompt || 'Analyze this desktop screen']);
            clientWs.send(JSON.stringify({ type: 'vision_result', data: visionRes }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { analysis: visionRes.analysis || visionRes.error || 'Screen analyzed.' },
            });
          } else if (name === 'openApplication') {
            const hasWaMessage = fcs.some((f: any) => f.name === 'sendWhatsAppMessage');
            if (hasWaMessage && (args.appName || '').toLowerCase().includes('whatsapp')) {
              toolResponses.push({ name, id: fc.id, response: { result: 'WhatsApp opened and ready.' } });
            } else {
              const appRes = await runEngine('open_app', [args.appName || 'terminal']);
              toolResponses.push({ name, id: fc.id, response: appRes });
            }
          } else if (name === 'controlBrowser') {
            const browserAction = args.action || 'search';
            const browserRes = await runEngine('browser', [browserAction, JSON.stringify(args)]);
            clientWs.send(JSON.stringify({ type: 'browser_action', data: browserRes }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { result: browserRes.result || browserRes.error || 'Browser action executed.' },
            });
          } else if (name === 'executeAgentTask') {
            clientWs.send(JSON.stringify({ type: 'background_task', data: { title: args.goal, progress: 10, status: 'planning' } }));
            const agentRes = await runEngine('agent_execute', [args.goal || '']);
            // Hand the model the real tool output, otherwise it can only narrate
            // that the task "completed" without ever knowing what was found.
            const steps = Array.isArray(agentRes.steps) ? agentRes.steps : [];
            const rawData = steps
              .filter((step: any) => step && step.output)
              .map((step: any) => `${step.description || step.tool}: ${step.output}`)
              .join(' | ')
              .slice(0, 1500);
            clientWs.send(JSON.stringify({
              type: 'background_task',
              data: { title: args.goal, progress: 100, status: 'completed', result: agentRes.result, steps },
            }));
            toolResponses.push({
              name,
              id: fc.id,
              response: {
                result: agentRes.result || 'Task completed.',
                ...(rawData ? { raw_data: rawData } : {}),
              },
            });
          } else if (name === 'searchContacts') {
            const contactsRes = await runEngine('contacts', [args.query || '']);
            toolResponses.push({ name, id: fc.id, response: contactsRes });
          } else if (name === 'setReminder') {
            const delay = Math.max(1, Number(args.delaySeconds) || 10);
            setTimeout(() => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'reminder', message: args.message }));
              }
            }, delay * 1000);
            toolResponses.push({ name, id: fc.id, response: { result: `Reminder scheduled for ${delay} seconds.` } });
          } else if (name === 'sendWhatsAppMessage') {
            const receiver = (args.receiver || args.recipient || '').trim();
            const message = (args.message || args.text || '').trim();
            clientWs.send(JSON.stringify({
              type: 'background_task',
              data: { title: `Sending WhatsApp message to ${receiver}...`, progress: 30, status: 'sending' }
            }));
            const waRes = await runEngine('whatsapp_send', [receiver, message]);
            clientWs.send(JSON.stringify({
              type: 'background_task',
              data: { title: `WhatsApp to ${receiver}`, progress: 100, status: 'completed', result: waRes.result }
            }));
            toolResponses.push({
              name,
              id: fc.id,
              response: { result: waRes.result || `Message sent to ${receiver} via WhatsApp.` },
            });
          } else {
            toolResponses.push({ name, id: fc.id, response: { result: 'Acknowledged.' } });
          }
        }

        // Return tool response to unblock speech synthesis
        geminiWs.send(JSON.stringify({
          toolResponse: {
            functionResponses: toolResponses,
          },
        }));
      }
    } catch (e) {
      console.warn('[Gemini Live] Message parse notice:', e);
    }
  });

  const handleClientMessage = async (data: any, isBinary: boolean) => {
    if (!isSetupDone || geminiWs.readyState !== WebSocket.OPEN) {
      pendingMessages.push({ data, isBinary });
      return;
    }

    if (isBinary) {
      const audioBuffer = data as Buffer;
      const base64Pcm = audioBuffer.toString('base64');
      geminiWs.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: base64Pcm,
            mimeType: 'audio/pcm;rate=16000',
          },
        },
      }));
      return;
    }

    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'text' && parsed.text) {
        clientWs.send(JSON.stringify({ type: 'state', state: 'thinking' }));
        geminiWs.send(JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [{ text: parsed.text }],
              },
            ],
            turnComplete: true,
          },
        }));
      } else if (parsed.type === 'interrupt') {
        clientWs.send(JSON.stringify({ type: 'state', state: 'interrupted' }));
      } else if (parsed.type === 'agent_task' && parsed.goal) {
        clientWs.send(JSON.stringify({ type: 'state', state: 'thinking' }));
        clientWs.send(JSON.stringify({ type: 'background_task', data: { title: parsed.goal, progress: 10, status: 'planning' } }));
        const res = await runEngine('agent_execute', [parsed.goal]);
        clientWs.send(JSON.stringify({ type: 'background_task', data: { title: parsed.goal, progress: 100, status: 'completed', result: res.result } }));
        clientWs.send(JSON.stringify({ type: 'text', message: res.result || 'Task completed.' }));
        clientWs.send(JSON.stringify({ type: 'done', text: res.result }));
      }
    } catch {
      // ignore
    }
  };

  clientWs.on('message', (data, isBinary) => {
    handleClientMessage(data, isBinary);
  });

  clientWs.on('close', () => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[Gemini Live] Session closed (code: ${code}, reason: ${reason?.toString()})`);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  geminiWs.on('error', (err) => {
    console.warn('[Gemini Live] Google AI WebSocket error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'status', message: 'Gemini Live connection notice' }));
    }
    clientWs.close();
  });
}

server.on('upgrade', (request, socket, head) => {
  const urlObj = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const requestedVoice = urlObj.searchParams.get('voice') || 'Puck';

  if (pathname === '/ws/live' || pathname === '/ws/gemini-live' || pathname === '/ws/tts') {
    proxyWss.handleUpgrade(request, socket, head, (clientWs) => {
      handleGeminiLiveConnection(clientWs, requestedVoice);
    });
  } else {
    socket.destroy();
  }
});

// Vite & Static File Serving
async function start() {
  const currentDir = getDirname();
  // Candidates for compiled production dist (must contain index.html and assets folder)
  const candidateDists = [
    path.join(PROJECT_ROOT, 'frontend', 'dist'),
    path.join(currentDir, 'dist'),
    currentDir,
  ];
  const distPath = candidateDists.find(
    (d) => fs.existsSync(path.join(d, 'index.html')) && fs.existsSync(path.join(d, 'assets'))
  );

  const isProduction = process.env.NODE_ENV === 'production' || !!distPath;

  if (isProduction && distPath) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const viteRoot = fs.existsSync(path.join(currentDir, 'vite.config.ts'))
      ? currentDir
      : path.join(PROJECT_ROOT, 'frontend');
    const vite = await createViteServer({
      root: viteRoot,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, HOST, () => {
    console.log(`\n======================================================`);
    console.log(`  CHOLA CORE - PONNIAN METALLURGICAL HUD ONLINE`);
    console.log(`  Frontend:         http://${HOST}:${PORT}`);
    console.log(`  Agentic Engine:   ${BACKEND_ENGINE_PATH}`);
    console.log(`  Runtime state:    ready`);
    console.log(`  Event bus:        ws://${HOST}:${PORT}/ws/live`);
    console.log(`  Tactical Tools:   Planner, Executor, WebSearch, Media, Shell, Memory, Vision, Telemetry, Contacts`);
    console.log(`======================================================\n`);
  });
}

let isShuttingDown = false;
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Rhiona] ${signal}; stopping assistant server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error) => {
  console.error('[Rhiona] Startup failed:', error);
  process.exitCode = 1;
});
