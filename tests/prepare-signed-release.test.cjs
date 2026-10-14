'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareSignedRelease } = require('../scripts/prepare-signed-release.cjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'liao-release-test-'));
  fs.mkdirSync(path.join(root, 'src-tauri', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src-tauri/Cargo.toml'), '[dependencies]\n');
  fs.writeFileSync(path.join(root, 'src-tauri/src/lib.rs'), '// base app\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: {} }));
  const cfg = path.join(root, 'src-tauri/tauri.conf.json');
  fs.writeFileSync(cfg, JSON.stringify({ bundle: { active: true }, app: {} }));
  return { root, cfg, close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const opts = { enabled: true, privateKey: 'DUMMY_TEST_KEY', pubkey: 'R'.repeat(64) };
test('unconfigured signed mode leaves existing app config untouched', () => {
  const env = fixture();
  try {
    const before = fs.readFileSync(env.cfg, 'utf8');
    assert.equal(prepareSignedRelease(env.root, { enabled: false }).signed, false);
    assert.equal(fs.readFileSync(env.cfg, 'utf8'), before);
  } finally { env.close(); }
});
test('signed flag without secret or public key fails closed', () => {
  const env = fixture();
  try {
    assert.throws(() => prepareSignedRelease(env.root, { enabled: true, pubkey: opts.pubkey }), /PRIVATE_KEY/);
    assert.throws(() => prepareSignedRelease(env.root, { enabled: true, privateKey: opts.privateKey }), /PUBLIC_KEY/);
  } finally { env.close(); }
});
test('signed flag without plugin registration fails closed', () => {
  const env = fixture();
  try {
    assert.throws(() => prepareSignedRelease(env.root, opts), /plugin must be fully registered/);
  } finally { env.close(); }
});
test('fully configured signed build emits updater config without leaking secrets', () => {
  const env = fixture();
  try {
    fs.appendFileSync(path.join(env.root, 'src-tauri/Cargo.toml'), 'tauri-plugin-updater = "2"\n');
    fs.appendFileSync(path.join(env.root, 'src-tauri/src/lib.rs'),
      '\napp.handle().plugin(tauri_plugin_updater::Builder::new().build());\n');
    fs.writeFileSync(path.join(env.root, 'package.json'),
      JSON.stringify({ dependencies: { '@tauri-apps/plugin-updater': '^2' } }));
    assert.equal(prepareSignedRelease(env.root, opts).signed, true);
    const config = fs.readFileSync(env.cfg, 'utf8');
    const parsed = JSON.parse(config);
    assert.equal(parsed.bundle.createUpdaterArtifacts, true);
    assert.equal(parsed.plugins.updater.pubkey, opts.pubkey);
    assert.equal(parsed.plugins.updater.windows.installMode, 'basicUi');
    assert(!config.includes(opts.privateKey));
  } finally { env.close(); }
});

test('commented-out updater registration does not bypass release gate', () => {
  const env = fixture();
  try {
    fs.appendFileSync(path.join(env.root, 'src-tauri/Cargo.toml'), 'tauri-plugin-updater = "2"\n');
    fs.appendFileSync(path.join(env.root, 'src-tauri/src/lib.rs'),
      '// app.handle().plugin(tauri_plugin_updater::Builder::new().build());\n');
    fs.writeFileSync(path.join(env.root, 'package.json'),
      JSON.stringify({ dependencies: { '@tauri-apps/plugin-updater': '^2' } }));
    assert.throws(() => prepareSignedRelease(env.root, opts), /plugin must be fully registered/);
  } finally { env.close(); }
});
