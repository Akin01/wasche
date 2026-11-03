#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PLATFORMS = {
  'win32-x64': 'wasche-windows-x64.exe',
  'linux-x64': 'wasche-linux-x64',
  'darwin-arm64': 'wasche-darwin-arm64',
  'darwin-x64': 'wasche-darwin-x64',
};

const key = `${os.platform()}-${os.arch()}`;
const binaryName = PLATFORMS[key];

if (!binaryName) {
  console.error(`[wasche] Unsupported platform or architecture: ${os.platform()} (${os.arch()})`);
  console.error('[wasche] Supported targets: Windows x64, Linux x64, macOS arm64, macOS x64');
  process.exit(1);
}

const binaryPath = path.join(__dirname, binaryName);

if (!fs.existsSync(binaryPath)) {
  console.error(`[wasche] Native binary not found at: ${binaryPath}`);
  console.error('[wasche] Please reinstall the package or report an issue on GitHub.');
  process.exit(1);
}

// Spawn native binary with inherited stdio for MCP JSON-RPC protocol
const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  console.error(`[wasche] Failed to start native process: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

// Relay termination signals to child process
const forwardSignal = (sig) => {
  process.on(sig, () => {
    if (child && !child.killed) {
      child.kill(sig);
    }
  });
};

forwardSignal('SIGINT');
forwardSignal('SIGTERM');
