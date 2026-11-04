// Drives headless Chrome over the DevTools protocol, with no packages: Node's
// own WebSocket is enough. One Browser is one Chrome with one fresh profile;
// its pages share localStorage, like tabs of the same browser would.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Resolves with the promise, or after ms, and leaves no timer behind to keep Node alive.
const within = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise((r) => { timer = setTimeout(r, ms); })]).finally(() => clearTimeout(timer));
};

// One WebSocket to the browser; each page talks through its own sessionId.
class Connection {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (p) m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
      } else for (const fn of this.listeners) fn(m);
    });
    ws.addEventListener('close', () => {
      for (const p of this.pending.values()) p.reject(new Error(`${p.method}: Chrome closed`));
      this.pending.clear();
    });
  }
  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

function killTree(child) {
  if (child.exitCode !== null) return;
  // Chrome runs helper processes; on Windows kill the whole tree.
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { child.kill(); }
}

async function removeProfile(dir) {
  // Chrome may hold a file for a moment after it exits.
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { await sleep(200); }
  }
}

export async function launch() {
  const profile = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mazi-chrome-'));
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank',
  ], { stdio: 'ignore' });
  const exited = new Promise((r) => child.once('exit', r));
  child.once('error', () => {});
  try {
    // Chrome writes the port it picked, and the browser's socket path, to this file.
    let lines;
    for (let i = 0; i < 100 && !lines; i++) {
      if (child.exitCode !== null) throw new Error('Chrome exited before it was ready');
      try {
        const read = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
        if (read.length >= 2) lines = read;
      } catch { /* not written yet */ }
      if (!lines) await sleep(100);
    }
    if (!lines) throw new Error('Chrome did not report a DevTools port');
    const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
    await new Promise((ok, fail) => {
      ws.addEventListener('open', ok);
      ws.addEventListener('error', () => fail(new Error('cannot connect to Chrome')));
    });
    return new Browser(new Connection(ws), child, exited, profile);
  } catch (e) {
    // A failed launch must not leave Chrome running.
    killTree(child);
    await within(exited, 3000);
    await removeProfile(profile);
    throw e;
  }
}

class Browser {
  constructor(conn, child, exited, profile) {
    Object.assign(this, { conn, child, exited, profile });
  }

  async newPage(opts = {}) {
    const { targetId } = await this.conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this.conn, sessionId, targetId);
    await page.setup(opts);
    return page;
  }

  async close() {
    this.conn.send('Browser.close').catch(() => {});
    await within(this.exited, 3000);
    killTree(this.child);
    await within(this.exited, 3000);
    try { this.conn.ws.close(); } catch { /* already closed */ }
    await removeProfile(this.profile);
  }
}

class Page {
  errors = [];
  #media = {};
  #waiters = new Set();
  #urls = new Map();
  #statuses = new Map();

  constructor(conn, sessionId, targetId) {
    Object.assign(this, { conn, sessionId, targetId });
    conn.listeners.add((m) => { if (m.sessionId === sessionId) this.#onEvent(m); });
  }

  send(method, params) { return this.conn.send(method, params, this.sessionId); }

  async setup({ width = 1280, height = 900, mobile = false, colorScheme, reducedMotion = false,
    javascript = true, userAgent, blockUrls = [], initScript } = {}) {
    for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await this.send(domain + '.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await this.media({ colorScheme, reducedMotion });
    if (!javascript) await this.send('Emulation.setScriptExecutionDisabled', { value: true });
    if (userAgent) await this.send('Emulation.setUserAgentOverride', { userAgent });
    if (blockUrls.length) await this.send('Network.setBlockedURLs', { urls: blockUrls });
    if (initScript) await this.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
  }

  #onEvent({ method, params }) {
    const isFavicon = (url = '') => /\/favicon\.ico(\?|$)/.test(url);
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      this.errors.push(d.exception?.description || d.text);
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      this.errors.push('console.error: ' + params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Network.requestWillBeSent') {
      this.#urls.set(params.requestId, params.request.url);
    } else if (method === 'Network.responseReceived') {
      const { url, status } = params.response;
      this.#statuses.set(params.requestId, status);
      if (params.type !== 'Document' && status >= 400 && !isFavicon(url)) this.errors.push(`${status} ${url}`);
    } else if (method === 'Network.loadingFailed') {
      // A request the test blocked on purpose is not a failure.
      const url = this.#urls.get(params.requestId) ?? '';
      if (!params.blockedReason && !params.canceled && !isFavicon(url)) this.errors.push(`${params.errorText} ${url}`);
    } else if (method === 'Page.loadEventFired') {
      for (const wake of this.#waiters) wake();
    }
  }

  async goto(url) {
    const loaded = new Promise((r) => this.#waiters.add(r));
    const { loaderId, errorText } = await this.send('Page.navigate', { url });
    if (errorText) throw new Error(`${errorText} ${url}`);
    await within(loaded, 15000);
    this.#waiters.clear();
    await sleep(300);
    // The main document's request id is the navigation's loader id.
    return { status: this.#statuses.get(loaderId) };
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }

  // Scrolls the element into view and returns the middle of it.
  async #centre(selector) {
    const point = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    if (!point) throw new Error(`no element matches ${selector}`);
    return point;
  }

  async hover(selector) {
    const [x, y] = await this.#centre(selector);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  }

  async click(selector) {
    const [x, y] = await this.#centre(selector);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }

  // Changes the emulated media, also while the page is open. Leaving a value out keeps the last one.
  async media(change) {
    for (const [k, v] of Object.entries(change)) if (v !== undefined) this.#media[k] = v;
    const { colorScheme, reducedMotion } = this.#media;
    const features = [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }];
    if (colorScheme) features.push({ name: 'prefers-color-scheme', value: colorScheme });
    await this.send('Emulation.setEmulatedMedia', { features });
  }

  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }

  async close() { await this.conn.send('Target.closeTarget', { targetId: this.targetId }); }
}
