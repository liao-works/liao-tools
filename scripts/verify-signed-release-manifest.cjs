'use strict';
// Offline gate used after all matrix jobs have uploaded their GitHub Release assets.
// Structural consistency is checked here; Tauri plugin performs cryptographic verification.
const fs = require('node:fs');
const filePath = require('node:path');
const { checkSignedReleaseAssets } = require('./verify-release-assets.cjs');
const { expectedTargets, verifySignedManifest } = require('./build-signed-updater-manifest.cjs');
function verifyRelease(tag, assets, signatures, manifest) {
  const assetStatus = checkSignedReleaseAssets(tag, assets);
  const contentStatus = verifySignedManifest(tag, assets, signatures, manifest);
  return { ok: assetStatus.ok && contentStatus.ok,
    issues: [...assetStatus.issues, ...contentStatus.issues] };
}
function main() {
  const [, , tag, assetsFile, signaturesDir, manifestFile] = process.argv;
  if (!tag || !assetsFile || !signaturesDir || !manifestFile) {
    console.error('Usage: node scripts/verify-signed-release-manifest.cjs <tag> <assets.json> <signatures-dir> <latest.json>');
    process.exitCode = 2;
    return;
  }
  try {
    const assets = JSON.parse(fs.readFileSync(assetsFile, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const expected = new Set(Object.values(expectedTargets(tag.slice(1))).flat().map(s => s + '.sig'));
    const signatures = Object.fromEntries([...expected]
      .filter(name => fs.existsSync(filePath.join(signaturesDir, name)))
      .map(name => [name, fs.readFileSync(filePath.join(signaturesDir, name), 'utf8')]));
    const result = verifyRelease(tag, assets, signatures, manifest);
    if (!result.ok) throw new Error(result.issues.join('; '));
    console.log('Signed release manifest: platform URLs and signature contents verified.');
  } catch (error) {
    console.error('Refused signed publication: ' + error.message);
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { verifyRelease };
