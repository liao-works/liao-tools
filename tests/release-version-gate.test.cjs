'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {verifyReleaseVersion,normalizeReleaseResponse}=require('../scripts/release-version-gate.cjs');
const release=(tag_name,options={})=>({tag_name,draft:false,prerelease:false,...options});

test('accepts a newer stable version in nested or flat GitHub API data',()=>{
 assert.equal(verifyReleaseVersion('v0.0.14',[[release('v0.0.13')]]).ok,true);
 assert.equal(verifyReleaseVersion('v0.1.0',[release('v0.0.13')]).ok,true);
});
test('rejects public duplicates, equal and lower versions',()=>{
 for (const tag of ['v0.0.13','v0.0.12','v0.0.11'])
   assert.equal(verifyReleaseVersion(tag,[release('v0.0.13'),release('v0.0.12')]).ok,false);
});
test('allows retrying existing newer draft and ignores prereleases',()=>{
 const all=[release('v0.0.13'),release('v0.0.15',{draft:true}),release('v0.0.16-rc.1',{prerelease:true})];
 assert.equal(verifyReleaseVersion('v0.0.15',all).ok,true);
 assert.equal(verifyReleaseVersion('v0.0.14',all).ok,true);
});
test('compares major minor patch numerically',()=>{
 assert.equal(verifyReleaseVersion('v0.0.10',[release('v0.0.9')]).ok,true);
 assert.equal(verifyReleaseVersion('v0.9.0',[release('v0.10.0')]).ok,false);
 assert.equal(verifyReleaseVersion('v2.0.0',[release('v1.999.999')]).ok,true);
});
test('rejects invalid tags and missing release attributes',()=>{
 assert.equal(verifyReleaseVersion('v0.0.14-beta',[]).ok,false);
 assert.equal(verifyReleaseVersion('main',[]).ok,false);
 assert.throws(()=>verifyReleaseVersion('v0.0.14',[{tag_name:'v0.0.13'}]),/incomplete/);
 assert.throws(()=>normalizeReleaseResponse({items:[]}),/complete/);
});
test('CLI accepts new tag and refuses downgrade on disk',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liao-release-gate-'));
 try {
   const file=path.join(dir,'releases.json');
   fs.writeFileSync(file,JSON.stringify([[release('v0.0.13')]]));
   const cli=path.resolve(__dirname,'../scripts/release-version-gate.cjs');
   const good=spawnSync(process.execPath,[cli,'v0.0.14',file],{encoding:'utf8'});
   assert.equal(good.status,0,good.stderr);
   const bad=spawnSync(process.execPath,[cli,'v0.0.12',file],{encoding:'utf8'});
   assert.notEqual(bad.status,0);
   assert.match(bad.stderr,/refused publication/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('signed channel cannot regress to unsigned once latest.json was public', () => {
 const previous = [release('v0.0.15', { assets:[{name:'latest.json'}] })];
 assert.equal(verifyReleaseVersion('v0.0.16',previous,{requireSigned:false}).ok,false);
 assert.equal(verifyReleaseVersion('v0.0.16',previous,{requireSigned:true}).ok,true);
});
test('legacy unsigned release can transition to signed or another manual release', () => {
 const previous = [release('v0.0.13',{assets:[]})];
 assert.equal(verifyReleaseVersion('v0.0.14',previous,{requireSigned:true}).ok,true);
 assert.equal(verifyReleaseVersion('v0.0.14',previous,{requireSigned:false}).ok,true);
 assert.equal(verifyReleaseVersion('v0.0.14',[release('v0.0.13')],{requireSigned:false}).ok,false);
});
