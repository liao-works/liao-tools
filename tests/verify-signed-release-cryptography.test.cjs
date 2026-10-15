'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { decodePublicKey, verifySignedArtifacts } =
  require('../scripts/verify-signed-release-cryptography.cjs');

function execute(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', timeout: 30000 });
}
function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'liao-crypto-test-'));
  const pub = path.join(temp, 'ephemeral.pub');
  const sec = path.join(temp, 'ephemeral.key');
  const created = execute('minisign', ['-G', '-W', '-p', pub, '-s', sec]);
  assert.equal(created.status, 0, created.stderr);
  const key = fs.readFileSync(pub).toString('base64');
  const names = {
    'windows-x86_64': 'liao-tools_0.0.14_x64-setup.exe',
    'darwin-x86_64': 'liao-tools_x64.app.tar.gz',
    'darwin-aarch64': 'liao-tools_aarch64.app.tar.gz',
  };
  const platforms = {};
  for (const [target, name] of Object.entries(names)) {
    const file = path.join(temp, name);
    fs.writeFileSync(file, 'synthetic Tauri updater package for ' + target + '\n');
    const sig = path.join(temp, name + '.minisig');
    const signed = execute('minisign', ['-S', '-s', sec, '-m', file, '-x', sig, '-t', 'r16 test']);
    assert.equal(signed.status, 0, signed.stderr);
    platforms[target] = {
      url: 'https://github.com/liao-works/liao-tools/releases/download/v0.0.14/' + name,
      signature: fs.readFileSync(sig).toString('base64'),
    };
  }
  return {
    temp, key,
    manifest: { version: '0.0.14', platforms },
    cleanup: () => fs.rmSync(temp, { recursive: true, force: true }),
  };
}
test('reject malformed base64 and non-minisign trusted public keys', () => {
  assert.throws(() => decodePublicKey('not-a-key'), /Base64/);
  assert.throws(() => decodePublicKey(Buffer.from('not a minisign key').toString('base64')), /Minisign/);
});
test('real ephemeral signatures verify with Minisign without production keys', () => {
  const f = fixture();
  try {
    assert.equal(verifySignedArtifacts('v0.0.14', f.manifest, f.key, f.temp).verified.length, 3);
  } finally { f.cleanup(); }
});
test('changing package bytes blocks publication', () => {
  const f = fixture();
  try {
    fs.appendFileSync(path.join(f.temp, 'liao-tools_x64.app.tar.gz'), 'tamper');
    assert.throws(() => verifySignedArtifacts('v0.0.14', f.manifest, f.key, f.temp), /verification failed/);
  } finally { f.cleanup(); }
});
test('changing signature or trusted public key blocks publication', () => {
  const f = fixture();
  try {
    const changed = JSON.parse(JSON.stringify(f.manifest));
    changed.platforms['darwin-x86_64'].signature =
      changed.platforms['windows-x86_64'].signature;
    assert.throws(() => verifySignedArtifacts('v0.0.14', changed, f.key, f.temp), /verification failed/);
    const wrong = fixture();
    try {
      assert.throws(() => verifySignedArtifacts('v0.0.14', f.manifest, wrong.key, f.temp), /verification failed/);
    } finally { wrong.cleanup(); }
  } finally { f.cleanup(); }
});
test('unexpected platform, foreign URL and missing file block publication', () => {
  const f = fixture();
  try {
    const extra = JSON.parse(JSON.stringify(f.manifest));
    extra.platforms['linux-x86_64'] = {};
    assert.throws(() => verifySignedArtifacts('v0.0.14', extra, f.key, f.temp), /targets/);
    const wrongUrl = JSON.parse(JSON.stringify(f.manifest));
    wrongUrl.platforms['windows-x86_64'].url = 'https://example.org/evil.exe';
    assert.throws(() => verifySignedArtifacts('v0.0.14', wrongUrl, f.key, f.temp), /Untrusted/);
    fs.rmSync(path.join(f.temp, 'liao-tools_aarch64.app.tar.gz'));
    assert.throws(() => verifySignedArtifacts('v0.0.14', f.manifest, f.key, f.temp));
  } finally { f.cleanup(); }
});
