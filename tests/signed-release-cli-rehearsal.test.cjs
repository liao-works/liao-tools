'use strict';
// End-to-end, OFFLINE rehearsal of the publisher's real CLI scripts. All
// signatures and GitHub metadata are synthetic; no real signing is implied.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const build = path.join(root, 'scripts/build-signed-updater-manifest.cjs');
const verify = path.join(root, 'scripts/verify-signed-release-manifest.cjs');
const tag = 'v0.0.14';
const base = 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/';

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liao-signed-release-contract-'));
  const sigdir = path.join(dir, 'signatures');
  fs.mkdirSync(sigdir);
  const names = [
    'liao-tools_0.0.14_x64-setup.exe',
    'liao-tools_0.0.14_x64_en-US.msi',
    'liao-tools_0.0.14_aarch64.dmg',
    'liao-tools_0.0.14_x64.dmg',
    'liao-tools_0.0.14_universal.dmg',
    'liao-tools_x64.app.tar.gz',
    'liao-tools_aarch64.app.tar.gz',
  ];
  const archiveNames = [
    'liao-tools_0.0.14_x64-setup.exe',
    'liao-tools_x64.app.tar.gz',
    'liao-tools_aarch64.app.tar.gz',
  ];
  const all = [...names, ...archiveNames.map(name => name + '.sig'), 'latest.json'];
  const asset = name => ({
    name, size: 2048, digest: 'sha256:' + 'b'.repeat(64),
    browser_download_url: base + name,
  });
  const assets = all.map(asset);
  const assetsFile = path.join(dir, 'assets.json');
  const manifestFile = path.join(dir, 'latest.json');
  fs.writeFileSync(assetsFile, JSON.stringify(assets));
  for (const [i, name] of archiveNames.entries()) {
    // Intentionally synthetic BASE64-looking values, not actual signatures.
    fs.writeFileSync(path.join(sigdir, name + '.sig'), String.fromCharCode(65 + i).repeat(88) + '\n');
  }
  const run = (file, args) => spawnSync(process.execPath, [file, ...args], {
    cwd: root, encoding: 'utf8',
  });
  const buildArgs = [tag, assetsFile, sigdir, manifestFile];
  const verifyArgs = [tag, assetsFile, sigdir, manifestFile];
  return {
    dir, assets, assetsFile, manifestFile, sigdir,
    runBuild: () => run(build, buildArgs),
    runVerify: () => run(verify, verifyArgs),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('offline signed release CLI roundtrip builds manifest and verifies published asset metadata', () => {
  const f = makeFixture();
  try {
    const b = f.runBuild();
    assert.equal(b.status, 0, b.stderr);
    const manifest = JSON.parse(fs.readFileSync(f.manifestFile, 'utf8'));
    assert.deepEqual(Object.keys(manifest.platforms).sort(), [
      'darwin-aarch64', 'darwin-x86_64', 'windows-x86_64',
    ]);
    assert.equal(f.runVerify().status, 0);
  } finally { f.cleanup(); }
});

test('offline release rejects tampered signature file after manifest generation', () => {
  const f = makeFixture();
  try {
    assert.equal(f.runBuild().status, 0);
    fs.writeFileSync(path.join(f.sigdir, 'liao-tools_x64.app.tar.gz.sig'), 'X'.repeat(88));
    const verified = f.runVerify();
    assert.notEqual(verified.status, 0);
    assert.match(verified.stderr, /Refused signed publication/);
  } finally { f.cleanup(); }
});

test('offline release rejects stale manifest and incomplete asset list', () => {
  const f = makeFixture();
  try {
    assert.equal(f.runBuild().status, 0);
    const manifest = JSON.parse(fs.readFileSync(f.manifestFile, 'utf8'));
    manifest.version = '0.0.13';
    fs.writeFileSync(f.manifestFile, JSON.stringify(manifest));
    assert.notEqual(f.runVerify().status, 0);
    // Restore generated metadata then remove a required MSI release asset.
    manifest.version = '0.0.14';
    fs.writeFileSync(f.manifestFile, JSON.stringify(manifest));
    fs.writeFileSync(f.assetsFile, JSON.stringify(f.assets.filter(a => !a.name.endsWith('_x64_en-US.msi'))));
    assert.notEqual(f.runVerify().status, 0);
  } finally { f.cleanup(); }
});

test('offline release generation fails closed when one architecture is unsigned', () => {
  const f = makeFixture();
  try {
    fs.rmSync(path.join(f.sigdir, 'liao-tools_aarch64.app.tar.gz.sig'));
    const b = f.runBuild();
    assert.notEqual(b.status, 0);
    assert.match(b.stderr, /Missing updater signature/);
    assert.equal(fs.existsSync(f.manifestFile), false);
  } finally { f.cleanup(); }
});
