'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const yml = readFileSync(require('node:path').join(__dirname,'..','.github','workflows','release.yml'),'utf8');
test('matrix release action may upload signatures but must NOT publish partial latest.json',()=>{
  assert.match(yml,/uploadUpdaterJson:\s*false/);
  assert.match(yml,/uploadUpdaterSignatures:\s*true/);
  assert.match(yml,/releaseDraft:\s*true/);
});
test('single downstream job consolidates signatures and verifies uploaded latest.json before publishing',()=>{
  assert.match(yml,/verify-and-publish:\s*\n\s*needs:\s*release/);
  assert.match(yml,/gh release download "\$TAG"[^\n]*\n\s*--pattern '\*\.sig'/);
  assert.match(yml,/node scripts\/build-signed-updater-manifest\.cjs/);
  assert.match(yml,/gh release upload "\$TAG"/);
  assert.match(yml,/cmp "\$\{RUNNER_TEMP\}\/latest\.json"/);
  assert.match(yml,/node scripts\/verify-signed-release-manifest\.cjs/);
  assert(yml.indexOf('node scripts/verify-signed-release-manifest.cjs') < yml.indexOf('await github.rest.repos.updateRelease'));
});
test('unsigned releases cannot turn on signed mode without required configured key',()=>{
  assert.match(yml,/node scripts\/prepare-signed-release\.cjs/);
  assert.match(yml,/vars\.REQUIRE_SIGNED_UPDATER/);
  assert.doesNotMatch(yml,/git push origin HEAD:master/);
});
