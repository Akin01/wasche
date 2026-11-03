#!/usr/bin/env node
/**
 * Assembles npm package bundle from prebuilt binary artifacts
 * Usage: node scripts/assemble-npm.js [artifacts_dir] [tag_version]
 */

const fs = require('fs');
const path = require('path');

const artifactsDir = process.argv[2] || 'npm-artifacts';
const tagVersion = process.argv[3] || process.env.TAG_VERSION || '';
const npmDir = path.resolve(__dirname, '../npm');
const binDir = path.join(npmDir, 'bin');

fs.mkdirSync(binDir, { recursive: true });

// Copy all binary artifacts
if (fs.existsSync(artifactsDir)) {
  for (const file of fs.readdirSync(artifactsDir)) {
    const src = path.join(artifactsDir, file);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(binDir, file);
    fs.copyFileSync(src, dest);
    try {
      fs.chmodSync(dest, 0o755);
    } catch (_) {}
    console.log(`Copied binary artifact: ${file}`);
  }
} else {
  console.warn(`Artifacts directory not found: ${artifactsDir}`);
}

// Copy root LICENSE into npm package
const rootLicense = path.resolve(__dirname, '../LICENSE');
if (fs.existsSync(rootLicense)) {
  fs.copyFileSync(rootLicense, path.join(npmDir, 'LICENSE'));
  console.log('Synchronized LICENSE into npm package');
}

// Synchronize package.json version if version/tag was supplied
if (tagVersion) {
  const cleanVersion = tagVersion.replace(/^refs\/tags\/v|^v/, '');
  const pkgPath = path.join(npmDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = cleanVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`Synchronized npm/package.json version: ${cleanVersion}`);
  }
}
