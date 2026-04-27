#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const runtimeDir = path.join(rootDir, '.runtime');
const pidFile = path.join(runtimeDir, 'local-service.pid');
const logFile = path.join(runtimeDir, 'local-service.log');

fs.mkdirSync(runtimeDir, { recursive: true });

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (fs.existsSync(pidFile)) {
  const oldPidRaw = fs.readFileSync(pidFile, 'utf8').trim();
  const oldPid = Number.parseInt(oldPidRaw, 10);
  if (isPidRunning(oldPid)) {
    console.log(`ℹ️ الخدمة شغالة بالفعل (PID: ${oldPid})`);
    console.log(`📄 Logs: ${logFile}`);
    process.exit(0);
  }
  fs.rmSync(pidFile, { force: true });
}

const outFd = fs.openSync(logFile, 'a');
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
fs.writeSync(outFd, `[${stamp}] starting pnpm start:local\n`);

const child = spawn('bash', ['-lc', `cd "${rootDir}" && pnpm start:local`], {
  detached: true,
  stdio: ['ignore', outFd, outFd],
});

child.unref();
fs.closeSync(outFd);

fs.writeFileSync(pidFile, `${child.pid}\n`, 'utf8');

async function waitForHealth(maxSeconds) {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch('http://127.0.0.1:8080/api/healthz');
      if (r.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

setTimeout(async () => {
  if (!isPidRunning(child.pid ?? -1)) {
    // Some toolchains re-parent quickly; rely on health check as source of truth.
    const healthy = await waitForHealth(40);
    if (!healthy) {
      fs.rmSync(pidFile, { force: true });
      console.error(`❌ فشل تشغيل الخدمة. راجع اللوج: ${logFile}`);
      process.exit(1);
    }
  }

  console.log('✅ Local service started in background');
  console.log(`   PID: ${child.pid}`);
  console.log(`   Logs: ${logFile}`);
  console.log('   Frontend (when ready): http://localhost:18936');
  process.exit(0);
}, 1200);
