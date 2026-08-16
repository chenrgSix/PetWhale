#!/usr/bin/env node
/**
 * Install the built @petwhale/dsh plugin into a DSH web profile (the local
 * DeepSeek Harness / Telos integration path, design doc §22 + §24).
 *
 * Usage:
 *   node scripts/install-dsh-local.mjs [--target <web-profile-dir>] [--apply]
 *
 *   --target   web profile directory (default: $DSH_HOME/profiles/web, or
 *              $env:DSH_HOME on Windows).
 *   --apply    actually write; without it the script only prints the plan.
 *
 * Steps (each idempotent, originals backed up before modification):
 *   1. copy the built package (package.json + lib/) into
 *      <profile>/node_modules/@petwhale/dsh/ (requires `pnpm build` first);
 *   2. append a `- insert:` plugin row (id: petwhale, name: '@petwhale/dsh')
 *      to <profile>/cordis.patch.yml;
 *   3. declare "@petwhale/dsh" in <profile>/package.json dependencies so the
 *      healed node_modules fallback keeps resolving the row.
 *
 * The running harness must be restarted (or the web frontend reloaded) for
 * the new plugin row to take effect.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'packages', 'dsh');
const PLUGIN_ID = '@petwhale/dsh';

function parseArgs(argv) {
  const args = { target: undefined, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--target') args.target = argv[++i];
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function defaultTarget() {
  const home = process.env.DSH_HOME || (process.platform === 'win32'
    ? join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'Telos', 'runtime', 'dsh', 'web-home')
    : join(process.env.HOME || '', '.dsh'));
  return join(home, 'profiles', 'web');
}

function log(apply, message) {
  console.log(`${apply ? '[apply]' : '[plan ]'} ${message}`);
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `${file}.bak-${stamp}`;
  copyFileSync(file, backupFile);
  return backupFile;
}

function ensurePackageBuilt() {
  const checks = [
    join(PKG, 'lib', 'client.js'),
    join(PKG, 'lib', 'index.mjs'),
    join(PKG, 'lib', 'index.d.mts'),
  ];
  const missing = checks.filter((file) => !existsSync(file));
  if (missing.length > 0) {
    console.error('@petwhale/dsh is not built yet. Run `pnpm --filter @petwhale/dsh build` first.');
    process.exit(1);
  }
}

function stepCopyPackage(target, apply) {
  const dest = join(target, 'node_modules', PLUGIN_ID);
  log(apply, `copy package -> ${dest}`);
  if (apply) {
    mkdirSync(dest, { recursive: true });
    cpSync(join(PKG, 'package.json'), join(dest, 'package.json'), { force: true });
    cpSync(join(PKG, 'lib'), join(dest, 'lib'), { recursive: true, force: true });
  }
}

function stepPatchRoster(target, apply) {
  const file = join(target, 'cordis.patch.yml');
  const row = '- insert:\n    - id: petwhale\n      name: \'@petwhale/dsh\'\n';
  log(apply, `add plugin row to ${file}`);
  if (apply) {
    let content = readFileSync(file, 'utf8');
    if (content.includes('name: \'@petwhale/dsh\'')) {
      log(apply, '  (already present, skipping)');
      return;
    }
    backup(file);
    // An empty patch is a bare `[]` (possibly after comments): replace that
    // line with the insert block. Otherwise append the block to the list.
    const lines = content.split(/\r?\n/);
    const lastSignificant = [...lines]
      .reverse()
      .find((line) => line.trim() !== '' && !line.trim().startsWith('#'));
    if (lastSignificant !== undefined && lastSignificant.trim() === '[]') {
      const index = lines.lastIndexOf(lastSignificant);
      lines.splice(index, 1, row.replace(/\n$/, ''));
      content = lines.join('\n');
    } else {
      content = `${content.replace(/\s*$/, '')}\n${row}`;
    }
    writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`);
  }
}

function stepPatchDependencies(target, apply) {
  const file = join(target, 'package.json');
  log(apply, `declare "${PLUGIN_ID}" in ${file}`);
  if (apply) {
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const dependencies = manifest.dependencies ?? {};
    if (dependencies[PLUGIN_ID]) {
      log(apply, '  (already declared, skipping)');
      return;
    }
    backup(file);
    manifest.dependencies = { ...dependencies, [PLUGIN_ID]: '*' };
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function main() {
  const { target, apply } = parseArgs(process.argv);
  const profileDir = resolve(target ?? defaultTarget());

  if (!existsSync(join(profileDir, 'cordis.patch.yml'))) {
    console.error(`target is not a DSH web profile: ${profileDir}`);
    console.error('pass --target <profiles/web dir> or set DSH_HOME.');
    process.exit(1);
  }

  console.log(`target: ${profileDir}`);
  console.log(`mode:   ${apply ? 'APPLY' : 'dry-run (pass --apply to write)'}\n`);
  ensurePackageBuilt();
  stepCopyPackage(profileDir, apply);
  stepPatchRoster(profileDir, apply);
  stepPatchDependencies(profileDir, apply);

  console.log(`\nDone${apply ? '' : ' (no changes written)'}.`);
  if (!apply) {
    console.log('Re-run with --apply to write, then restart the harness.');
  } else {
    console.log('Restart the harness (or reload the web frontend) to load the plugin row.');
  }
}

main();
