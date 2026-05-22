#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const versionJsPath = path.join(rootDir, 'version.js');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const apiVersion = pkg.apiVersion || pkg.version;

if (!apiVersion || !/^\d+\.\d+\.\d+$/.test(apiVersion)) {
  throw new Error(`apiVersion invalide: "${apiVersion}". Format attendu: x.y.z`);
}

const versionJsContent = `window.__LUX_API_VERSION__ = '${apiVersion}';\n`;
fs.writeFileSync(versionJsPath, versionJsContent, 'utf8');
console.log(`[sync-api-version] updated ${path.relative(rootDir, versionJsPath)}`);

console.log(`[sync-api-version] apiVersion=${apiVersion}`);
