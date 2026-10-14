'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSignedManifest, expectedTargets, isTrustedAsset, verifySignedManifest } =
  require('../scripts/build-signed-updater-manifest.cjs');

const TAG = 'v0.0.14';
const signature = 'A'.repeat(88);
const asset = name => ({
  name, size: 1024, digest: 'sha256:' + 'a'.repeat(64),
  browser_download_url: 'https://github.com/liao-works/liao-tools/releases/download/' + TAG + '/' + name,
});
function fixture() {
  const targets = expectedTargets('0.0.14');
  const names = [
    targets['windows-x86_64'][0], targets['darwin-x86_64'][0], targets['darwin-aarch64'][0],
  ];
  return { assets: names.map(asset), signatures: Object.fromEntries(names.map(name => [name + '.sig', signature])) };
}
test('builds Tauri v2 static manifest from Windows and both macOS architectures', () => {
  const { assets, signatures } = fixture();
  const manifest = buildSignedManifest(TAG, assets, signatures, {
    notes: 'Release notes', pub_date: '2026-10-14T00:00:00Z',
  });
  assert.equal(manifest.version, '0.0.14');
  assert.deepEqual(Object.keys(manifest.platforms).sort(),
    ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
  assert.equal(manifest.platforms['windows-x86_64'].signature, signature);
  assert(manifest.platforms['windows-x86_64'].url.endsWith('.exe'));
  assert.equal(manifest.notes, 'Release notes');
});
test('missing one platform signature fails closed', () => {
  const data = fixture();
  delete data.signatures['liao-tools_aarch64.app.tar.gz.sig'];
  assert.throws(() => buildSignedManifest(TAG, data.assets, data.signatures), /Missing updater signature/);
});
test('missing one platform artifact fails closed', () => {
  const data = fixture();
  data.assets.pop();
  assert.throws(() => buildSignedManifest(TAG, data.assets, data.signatures), /darwin-aarch64/);
});
test('rejects signatures replaced by URLs, empty strings or paths', () => {
  for (const bad of ['', 'example.sig', 'https://malicious.example.com/file.sig']) {
    const data = fixture();
    data.signatures['liao-tools_x64.app.tar.gz.sig'] = bad;
    assert.throws(() => buildSignedManifest(TAG, data.assets, data.signatures), /Invalid updater signature/);
  }
});
test('rejects forged URLs, mismatched tags and unsigned artifacts', () => {
  const data = fixture();
  data.assets[0].browser_download_url = 'https://github.com.evil.org/liao-works/liao-tools/releases/download/' + TAG + '/' + data.assets[0].name;
  assert.equal(isTrustedAsset(TAG, data.assets[0]), false);
  assert.throws(() => buildSignedManifest(TAG, data.assets, data.signatures), /Untrusted/);
  const clean = fixture();
  clean.assets[0].digest = null;
  assert.throws(() => buildSignedManifest(TAG, clean.assets, clean.signatures), /Untrusted/);
  assert.throws(() => buildSignedManifest('develop', clean.assets, clean.signatures), /stable/);
});
test('rejects duplicate matching artifacts', () => {
  const data = fixture();
  data.assets.push({ ...data.assets[0] });
  assert.throws(() => buildSignedManifest(TAG, data.assets, data.signatures), /Duplicate artifact/);
});
test('accepts Windows MSI signed fallback when NSIS is not published', () => {
  const data = fixture();
  const selected = expectedTargets('0.0.14')['windows-x86_64'][1];
  data.assets[0] = asset(selected);
  delete data.signatures['liao-tools_0.0.14_x64-setup.exe.sig'];
  data.signatures[selected + '.sig'] = signature;
  const manifest = buildSignedManifest(TAG, data.assets, data.signatures);
  assert(manifest.platforms['windows-x86_64'].url.endsWith('.msi'));
});

test('manifest signature contents must match actual published sidecar', () => {
 const f=fixture(), manifest=buildSignedManifest(TAG,f.assets,f.signatures);
 assert.equal(verifySignedManifest(TAG,f.assets,f.signatures,manifest).ok,true);
 const tampered=JSON.parse(JSON.stringify(manifest));
 tampered.platforms['darwin-x86_64'].signature='B'.repeat(88);
 assert.equal(verifySignedManifest(TAG,f.assets,f.signatures,tampered).ok,false);
});
test('signed manifest rejects stale versions, external package URLs and extra platforms', () => {
 const f=fixture(), manifest=buildSignedManifest(TAG,f.assets,f.signatures);
 assert.equal(verifySignedManifest(TAG,f.assets,f.signatures,{...manifest,version:'0.0.13'}).ok,false);
 const wrong=JSON.parse(JSON.stringify(manifest));
 wrong.platforms['windows-x86_64'].url='https://malicious.example.com/file.exe';
 assert.equal(verifySignedManifest(TAG,f.assets,f.signatures,wrong).ok,false);
 const extra={...manifest,platforms:{...manifest.platforms,'linux-x86_64':{}}};
 assert.equal(verifySignedManifest(TAG,f.assets,f.signatures,extra).ok,false);
});
