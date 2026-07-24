#!/usr/bin/env node --no-warnings
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Dev server lifecycle script for the IWSDK test orchestrator.
 *
 * Usage:
 *   node scripts/test-servers.mjs start   — start 9 dev servers, wait for ready, output port map JSON
 *   node scripts/test-servers.mjs ports   — read .mcp.json files, output port map JSON
 *   node scripts/test-servers.mjs stop    — kill all dev servers (process-group + port fallback)
 */

import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXAMPLES = join(ROOT, 'examples');

const ALL_DIRS = [
  'poke',
  'poke-ecs',
  'poke-environment',
  'poke-level',
  'poke-ui',
  'audio',
  'grab',
  'locomotion',
  'physics',
];

const command = process.argv[2];

if (!command || !['start', 'ports', 'stop'].includes(command)) {
  console.error('Usage: node scripts/test-servers.mjs <start|ports|stop>');
  process.exit(1);
}

/**
 * Path to the pidfile that records the process-group id of a dev server.
 * Spawned children are detached, so `child.pid` is also the pgid; persisting
 * it lets `stop` fan SIGTERM out to npm → iwsdk → vite → esbuild even when
 * the server never reaches command-ready and has no port to look up.
 */
function pidfilePath(dir) {
  return join(EXAMPLES, dir, '.iwsdk', 'runtime', 'server.pid');
}

function readPgid(dir) {
  const p = pidfilePath(dir);
  if (!existsSync(p)) return null;
  try {
    const n = parseInt(readFileSync(p, 'utf8').trim(), 10);
    return Number.isFinite(n) && n > 1 ? n : null;
  } catch {
    return null;
  }
}

function writePgid(dir, pgid) {
  const p = pidfilePath(dir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, String(pgid));
}

function unlinkPgid(dir) {
  try {
    unlinkSync(pidfilePath(dir));
  } catch {
    // already gone
  }
}

/**
 * Verify a pgid still belongs to the dev server we spawned in `expectedCwd`
 * before signaling. Linux recycles pids, so a stale pidfile from an aborted
 * run could point at an unrelated process group.
 */
function isOurProcessGroup(pgid, expectedCwd) {
  let cwd;
  try {
    cwd = readlinkSync(`/proc/${pgid}/cwd`);
  } catch {
    return false;
  }
  if (resolve(cwd) !== resolve(expectedCwd)) return false;

  try {
    const cmdline = readFileSync(`/proc/${pgid}/cmdline`, 'utf8');
    const argv = cmdline.split('\0').filter(Boolean);
    if (argv.length === 0) return false;
    return argv.some((arg) => /(^|\/)npm($|\s)/.test(arg));
  } catch {
    return false;
  }
}

/**
 * SIGTERM the process group; if anything survives ~2s, SIGKILL.
 * Returns false if the group is dead or the pid reuse guard rejects it.
 */
function killGroup(pgid, expectedCwd) {
  if (!isOurProcessGroup(pgid, expectedCwd)) return false;

  try {
    process.kill(-pgid, 'SIGTERM');
  } catch {
    return false;
  }

  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      process.kill(-pgid, 0);
    } catch {
      return true;
    }
    execSync('sleep 0.1');
  }

  try {
    process.kill(-pgid, 'SIGKILL');
  } catch {
    // gone between checks
  }
  return true;
}

/**
 * Read the IWSDK runtime session for a given example dir and extract the port.
 * Returns the port number when the runtime is connected and command-ready, else null.
 */
function readPort(dir) {
  const sessionPath = join(EXAMPLES, dir, '.iwsdk', 'runtime', 'session.json');
  if (!existsSync(sessionPath)) return null;
  try {
    const data = JSON.parse(readFileSync(sessionPath, 'utf8'));
    if (!data?.port) return null;
    if (data.browser && data.browser.commandReady !== true) return null;
    return parseInt(data.port, 10);
  } catch {
    return null;
  }
}

/**
 * Read ports from all dirs, return { dir: port } map.
 */
function readAllPorts() {
  const ports = {};
  for (const dir of ALL_DIRS) {
    const port = readPort(dir);
    if (port) ports[dir] = port;
  }
  return ports;
}

if (command === 'ports') {
  const ports = readAllPorts();
  const missing = ALL_DIRS.filter((d) => !ports[d]);
  if (missing.length > 0) {
    console.error(`Missing .mcp.json for: ${missing.join(', ')}`);
  }
  // Output to stdout as JSON (this is what the orchestrator parses)
  console.log(JSON.stringify(ports, null, 2));
}

if (command === 'start') {
  // Sweep leftover process groups from a prior aborted run before spawning.
  let swept = 0;
  for (const dir of ALL_DIRS) {
    const pgid = readPgid(dir);
    if (pgid && killGroup(pgid, join(EXAMPLES, dir))) {
      swept++;
      console.error(`  ${dir}: swept stale process group ${pgid}`);
    }
    unlinkPgid(dir);
  }
  if (swept > 0) console.error(`Swept ${swept} stale dev server(s).`);

  // Remove stale runtime session files so we only consider freshly registered servers.
  for (const dir of ALL_DIRS) {
    const sessionPath = join(
      EXAMPLES,
      dir,
      '.iwsdk',
      'runtime',
      'session.json',
    );
    if (existsSync(sessionPath)) unlinkSync(sessionPath);
  }

  // Start all servers
  console.error('Starting 9 dev servers...');
  const children = [];
  for (const dir of ALL_DIRS) {
    const cwd = join(EXAMPLES, dir);
    if (!existsSync(cwd)) {
      console.error(`  ${dir}: SKIP (not found)`);
      continue;
    }

    const logPath = `/tmp/iwsdk-dev-${dir}.log`;
    const logFd = openSync(logPath, 'w');

    const child = spawn('npm', ['run', 'dev'], {
      cwd,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    writePgid(dir, child.pid);
    children.push({ dir, pid: child.pid });
    console.error(`  ${dir}: started (pid ${child.pid})`);
  }

  // Poll for .mcp.json files
  console.error('Waiting for servers to be ready...');
  const startTime = Date.now();
  const TIMEOUT = 60_000;
  const POLL_INTERVAL = 1_000;

  while (Date.now() - startTime < TIMEOUT) {
    const ports = readAllPorts();
    const ready = Object.keys(ports).length;
    if (ready === ALL_DIRS.length) {
      console.error(`All ${ready} servers ready.`);
      // Output port map to stdout as JSON
      console.log(JSON.stringify(ports, null, 2));
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  // Timeout — report what's missing
  const ports = readAllPorts();
  const missing = ALL_DIRS.filter((d) => !ports[d]);
  console.error(
    `TIMEOUT: ${missing.length} server(s) not ready: ${missing.join(', ')}`,
  );
  console.error('Check logs: /tmp/iwsdk-dev-<name>.log');
  // Still output whatever ports we have
  console.log(JSON.stringify(ports, null, 2));
  process.exit(1);
}

if (command === 'stop') {
  let killed = 0;

  for (const dir of ALL_DIRS) {
    const pgid = readPgid(dir);
    if (pgid && killGroup(pgid, join(EXAMPLES, dir))) {
      console.log(`${dir}: killed process group ${pgid}`);
      killed++;
    }
    unlinkPgid(dir);
  }

  const ports = readAllPorts();
  for (const [dir, port] of Object.entries(ports)) {
    try {
      const pids = execSync(`lsof -t -i :${port} 2>/dev/null`, {
        encoding: 'utf8',
      })
        .trim()
        .split('\n')
        .filter(Boolean);

      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), 'SIGTERM');
        } catch {
          // already dead
        }
      }
      if (pids.length > 0) {
        console.log(
          `${dir} (port ${port}): killed ${pids.length} leftover process(es) via port`,
        );
        killed++;
      }
    } catch {
      // lsof returned nothing — server already stopped
    }
  }

  if (killed === 0) {
    console.log('No servers were running.');
  } else {
    console.log(`Stopped ${killed} server(s).`);
  }
}
