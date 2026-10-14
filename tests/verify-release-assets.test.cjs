'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkRelease, expectedAssets, checkSignedReleaseAssets } = require('../scripts/verify-release-assets.cjs');

const tag = 'v0.0.14';
function fixtures() {
  return expectedAssets('0.0.14').map(name => ({
    name,
    size: 1024,
    digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/' + name,
  }));
}
test('all Windows/macOS assets with digests are releasable', () => {
  assert.equal(checkRelease(tag, fixtures()).ok, true);
});
test('incomplete release stays unpublished', () => {
  const assets = fixtures().slice(0, -1);
  assert.equal(checkRelease(tag, assets).ok, false);
});
test('unsigned release stays unpublished', () => {
  const assets = fixtures();
  assets[0].digest = null;
  assert.equal(checkRelease(tag, assets).ok, false);
});
test('reject missing, duplicated and foreign-host assets', () => {
  const assets = fixtures();
  assets.push({ ...assets[1] });
  assert.equal(checkRelease(tag, assets).ok, false);
  assets.pop();
  assets[2].browser_download_url = 'https://example.com/install.dmg';
  assert.equal(checkRelease(tag, assets).ok, false);
  assets[2].browser_download_url = 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/other-file.dmg';
  assert.equal(checkRelease(tag, assets).ok, false);
  assets[2].browser_download_url = 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/liao-tools_0.0.14_x64.dmg/extra';
  assert.equal(checkRelease(tag, assets).ok, false);
});
test('reject non-semver release tags', () => {
  assert.equal(checkRelease('main', fixtures()).ok, false);
  assert.equal(checkRelease('v1.2.3-rc.1', fixtures()).ok, false);
});

test('signed release gate rejects unsigned legacy packages', () => {
  assert.equal(checkSignedReleaseAssets(tag, fixtures()).ok, false);
});
test('signed release gate accepts complete package and signature metadata', () => {
  const assets = fixtures();
  const names = [
    'liao-tools_0.0.14_x64-setup.exe',
    'liao-tools_x64.app.tar.gz',
    'liao-tools_aarch64.app.tar.gz',
  ];
  for (const name of names) {
    if (!assets.some(a => a.name === name)) {
      assets.push({
        name, size: 4096, digest: 'sha256:' + 'b'.repeat(64),
        browser_download_url: 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/' + name,
      });
    }
    assets.push({
      name: name + '.sig', size: 110, digest: 'sha256:' + 'c'.repeat(64),
      browser_download_url: 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/' + name + '.sig',
    });
  }
  assets.push({
    name: 'latest.json', size: 512, digest: 'sha256:' + 'd'.repeat(64),
    browser_download_url: 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/latest.json',
  });
  assert.equal(checkSignedReleaseAssets(tag, assets).ok, true);
  assets.find(a => a.name === 'liao-tools_x64.app.tar.gz.sig').digest = null;
  assert.equal(checkSignedReleaseAssets(tag, assets).ok, false);
});
