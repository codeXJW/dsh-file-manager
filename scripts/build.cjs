#!/usr/bin/env node
// @daxu8972/dsh-file-manager — Windows-friendly build (no bash required).
// Compiles src/ → lib/ with the plugin's own tsc (devDependency), linking the
// build-time type dependencies from an INSTALLED dsh package instead of a
// source checkout, so a checkout is never required.
//
// Usage: node scripts/build.cjs [--pkg <dsh-install-dir>]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

// --- Resolve the installed dsh package (source of type dependencies) ---
function probeInstalled() {
  const flagIdx = process.argv.indexOf('--pkg');
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) return path.resolve(process.argv[flagIdx + 1]);
  if (process.env.DSH_PKG) return process.env.DSH_PKG;
  const candidates = [
    // 常见全局安装位置（npm root -g 下的 @deepseek-ai/dsh）
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'dsh'),
    'D:\\Soft\\nvm\\v22.20.0\\node_modules\\@deepseek-ai\\dsh',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'node_modules', '@deepseek-ai'))) return c;
  }
  return '';
}

const PKG = probeInstalled();
if (!PKG || !fs.existsSync(path.join(PKG, 'node_modules', '@deepseek-ai'))) {
  console.error('build: cannot locate the installed dsh package (set DSH_PKG or pass --pkg <dir>)');
  process.exit(1);
}
const BASE = path.join(PKG, 'node_modules', '@deepseek-ai');
console.log(`=== dsh install: ${PKG} ===`);

// --- Find tsc (plugin's own devDependency) ---
const TSC_CANDIDATES = [
  path.join(ROOT, 'node_modules', '.bin', 'tsc.cmd'),
  path.join(ROOT, 'node_modules', '.bin', 'tsc'),
  path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
];
const tscBin = TSC_CANDIDATES.find((c) => fs.existsSync(c)) || '';
if (!tscBin) {
  console.error('build: tsc not found — run `npm install` (typescript devDependency) first');
  process.exit(1);
}
// node_modules/typescript/bin/tsc is a JS file — run it via node.
const tscInvoke = tscBin.endsWith('.js')
  ? `"${process.execPath}" "${tscBin}"`
  : `"${tscBin}"`;

// --- Helper: create junction symlink ---
function linkPkg(pkgName, target) {
  const link = path.resolve(ROOT, 'node_modules', pkgName);
  if (!fs.existsSync(target)) {
    console.error(`build: dependency target missing: ${target}`);
    process.exit(1);
  }
  fs.rmSync(link, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link, 'junction');
  console.log(`  linked ${pkgName} -> ${target}`);
}

// --- Link build-time type dependencies from the installed dsh tree ---
console.log('=== Linking build dependencies ===');
fs.mkdirSync(path.join(ROOT, 'node_modules', '@deepseek-ai'), { recursive: true });

// scoped runtime/type deps (all present under @deepseek-ai in the install)
for (const name of [
  'cordis', 'cosmokit', 'schemastery',
  'dsh-tools', 'dsh-llm', 'dsh-system-prompt',
  'dsh-shell', 'dsh-subprocess', 'dsh-sandbox', 'dsh-settings',
]) {
  linkPkg(`@deepseek-ai/${name}`, path.join(BASE, name));
}

// @standard-schema/spec (pulled in by cordis/schemastery types)
const ssSpec = path.join(PKG, 'node_modules', '@standard-schema', 'spec');
if (fs.existsSync(ssSpec)) {
  fs.rmSync(path.join(ROOT, 'node_modules', '@standard-schema'), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, 'node_modules', '@standard-schema'), { recursive: true });
  fs.symlinkSync(ssSpec, path.join(ROOT, 'node_modules', '@standard-schema', 'spec'), 'junction');
  console.log(`  linked @standard-schema/spec -> ${ssSpec}`);
}

// @types/node for compile-time node types
const typesNode = path.join(PKG, 'node_modules', '@types', 'node');
if (fs.existsSync(typesNode)) {
  linkPkg('@types/node', typesNode);
}

// --- Run tsc ---
console.log('=== Compiling src → lib ===');
execSync(`${tscInvoke} -p tsconfig.json`, { stdio: 'inherit', cwd: ROOT });
console.log('=== Build complete ===');