#!/usr/bin/env node
/**
 * Extracts release notes for a specific version from CHANGELOG.md
 * Usage: node scripts/extract-changelog.js <version> [output_file]
 */

const fs = require('fs');
const path = require('path');

const rawVersion = process.argv[2] || process.env.TAG_VERSION || '0.1.0';
const version = rawVersion.replace(/^v/, '');
const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');

if (!fs.existsSync(changelogPath)) {
  console.error(`CHANGELOG.md not found at ${changelogPath}`);
  process.exit(1);
}

const content = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(`## \\[\\[?${escapedVersion}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`);
const match = content.match(regex);

const notes = match ? match[1].trim() : `Release v${version}`;
const outputPath = process.argv[3];

if (outputPath) {
  fs.writeFileSync(outputPath, notes + '\n', 'utf8');
  console.log(`Extracted release notes for v${version} to ${outputPath}`);
} else {
  process.stdout.write(notes + '\n');
}
