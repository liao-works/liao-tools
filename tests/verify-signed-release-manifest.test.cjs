'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyRelease } = require('../scripts/verify-signed-release-manifest.cjs');
const { buildSignedManifest } = require('../scripts/build-signed-updater-manifest.cjs');

const tag = 'v0.0.14';
const version = '0.0.14';
const signature = 'A'.repeat(88);
const url = name => 'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/' + name;
const asset = name => ({ name, size: 2048, digest: 'sha256:'+'e'.repeat(64), browser_download_url: url(name) });
function fixture() {
  const basics = ['_x64-setup.exe','_x64_en-US.msi','_aarch64.dmg','_x64.dmg','_universal.dmg'].map(x=>'liao-tools_'+version+x);
  const updaterFiles = ['liao-tools_'+version+'_x64-setup.exe','liao-tools_x64.app.tar.gz','liao-tools_aarch64.app.tar.gz'];
  const assets=[...new Set([...basics,...updaterFiles])].map(asset);
  for(const name of updaterFiles) assets.push(asset(name+'.sig'));
  assets.push(asset('latest.json'));
  const signatures=Object.fromEntries(updaterFiles.map(name=>[name+'.sig',signature]));
  const manifest=buildSignedManifest(tag,assets,signatures);
  return {assets,signatures,manifest};
}
test('published signed manifest and downloaded signature bytes are consistent',()=>{
 const {assets,signatures,manifest}=fixture();
 assert.deepEqual(verifyRelease(tag,assets,signatures,manifest),{ok:true,issues:[]});
});
test('never publish when latest.json contains a stale version or foreign URL',()=>{
 const {assets,signatures,manifest}=fixture();
 assert.equal(verifyRelease(tag,assets,signatures,{...manifest,version:'0.0.13'}).ok,false);
 const forged=JSON.parse(JSON.stringify(manifest));
 forged.platforms['windows-x86_64'].url='https://example.com/evil.exe';
 assert.equal(verifyRelease(tag,assets,signatures,forged).ok,false);
});
test('never publish when one signed sidecar is missing or manifest signature differs',()=>{
 const f=fixture();
 delete f.signatures['liao-tools_x64.app.tar.gz.sig'];
 assert.equal(verifyRelease(tag,f.assets,f.signatures,f.manifest).ok,false);
 const good=fixture();
 good.manifest.platforms['darwin-aarch64'].signature='B'.repeat(88);
 assert.equal(verifyRelease(tag,good.assets,good.signatures,good.manifest).ok,false);
});
test('missing platform installer or final manifest asset keeps draft',()=>{
 const f=fixture();
 assert.equal(verifyRelease(tag,f.assets.filter(a=>a.name!=='latest.json'),f.signatures,f.manifest).ok,false);
 assert.equal(verifyRelease(tag,f.assets.filter(a=>a.name!=='liao-tools_'+version+'_x64_en-US.msi'),f.signatures,f.manifest).ok,false);
});
