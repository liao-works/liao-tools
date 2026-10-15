'use strict';
/**
 * Cryptographic release gate: verify each actual updater bundle against the
 * decoded Minisign signature embedded in latest.json and the trusted Tauri
 * updater public key. Structural checks are performed separately.
 * The private signing key is never needed for verification.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { expectedTargets } = require('./build-signed-updater-manifest.cjs');
const REPO = 'liao-works/liao-tools';
function decodeBase64(value, what) {
  if (typeof value !== 'string' || !value.length ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(what + ' is not canonical Base64');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new Error(what + ' is not canonical Base64');
  return decoded;
}
function decodePublicKey(key) {
  const data = decodeBase64(key, 'Trusted updater public key').toString('utf8');
  const lines = data.trim().split(/\r?\n/);
  if (lines.length !== 2 || !/^untrusted comment: minisign public key\b/i.test(lines[0])) {
    throw new Error('Trusted updater public key is not a Minisign public-key file');
  }
  const keyBlob = decodeBase64(lines[1], 'Minisign public key');
  if (keyBlob.length !== 42 || keyBlob[0] !== 0x45 || keyBlob[1] !== 0x64) {
    throw new Error('Trusted updater public key has an invalid Minisign Ed25519 body');
  }
  return data.endsWith('\n') ? data : data + '\n';
}
function verifySignedArtifacts(tag, manifest, publicKey, packagesDir, options = {}) {
  const targets = expectedTargets(tag.slice(1));
  if (manifest?.version !== tag.slice(1) || !manifest.platforms ||
      Object.keys(manifest.platforms).sort().join('|') !== Object.keys(targets).sort().join('|')) {
    throw new Error('Signed update manifest targets or version do not match the release');
  }
  const trustedKeyText = decodePublicKey(publicKey);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'liao-update-crypto-'));
  try {
    fs.chmodSync(tmp, 0o700);
    const publicKeyFile = path.join(tmp, 'trusted.pub');
    fs.writeFileSync(publicKeyFile, trustedKeyText, { mode: 0o600 });
    const verified = [];
    for (const [target, record] of Object.entries(manifest.platforms)) {
      if (!record || typeof record.url !== 'string' || typeof record.signature !== 'string') {
        throw new Error('Missing signed release data for ' + target);
      }
      const url = new URL(record.url);
      const fileName = decodeURIComponent(path.posix.basename(url.pathname));
      if (!targets[target].includes(fileName) ||
          record.url !== 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + fileName ||
          fileName.includes('/') || fileName.includes('\\')) {
        throw new Error('Untrusted updater bundle URL for ' + target);
      }
      const bundle = path.join(packagesDir, fileName);
      const stat = fs.statSync(bundle);
      if (!stat.isFile() || stat.size === 0) throw new Error('Empty or invalid signed bundle: ' + fileName);
      const signatureText = decodeBase64(record.signature, 'Signature for ' + target).toString('utf8');
      if (!signatureText.startsWith('untrusted comment:') || !signatureText.includes('\ntrusted comment:')) {
        throw new Error('Invalid Minisign signature document for ' + target);
      }
      const sigPath = path.join(tmp, target + '.minisig');
      fs.writeFileSync(sigPath, signatureText, { mode: 0o600 });
      const result = spawnSync(options.minisign || 'minisign',
        ['-V', '-m', bundle, '-p', publicKeyFile, '-x', sigPath], {
          encoding: 'utf8', timeout: 60000, shell: false,
        });
      if (result.error || result.status !== 0) {
        throw new Error('Cryptographic signature verification failed for ' + target +
          ' (' + fileName + ')');
      }
      verified.push({ target, fileName });
    }
    return { verified };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
function main() {
  const [, , tag, manifestFile, packagesDir] = process.argv;
  if (!tag || !manifestFile || !packagesDir) {
    console.error('Usage: node scripts/verify-signed-release-cryptography.cjs <tag> <latest.json> <packages-dir>');
    process.exitCode = 2;
    return;
  }
  try {
    const key = process.env.TAURI_UPDATER_PUBLIC_KEY;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const result = verifySignedArtifacts(tag, manifest, key, packagesDir);
    console.log('Verified ' + result.verified.length + ' updater bundles using trusted Minisign Ed25519 public key.');
  } catch (error) {
    console.error('Refused signed release: ' + error.message);
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { decodeBase64, decodePublicKey, verifySignedArtifacts };
