'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkRelease, expectedAssets } = require('../scripts/verify-release-assets.cjs');

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
});
test('reject non-semver release tags', () => {
  assert.equal(checkRelease('main', fixtures()).ok, false);
  assert.equal(checkRelease('v1.2.3-rc.1', fixtures()).ok, false);
});
