'use strict';
/**
 * Compose and validate a Tauri v2 static signed-updater manifest.
 * Input signatures MUST originate from Tauri signer artifacts and be verified
 * by the official updater against the trusted public key during installation.
 *
 * This builder validates provenance/packaging/structure. It does not and cannot
 * cryptographically verify .sig content without the trusted updater public key.
 */
const path = require('node:path');
const fs = require('node:fs');
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const REPO = 'liao-works/liao-tools';

function expectedTargets(version) {
  return {
    'windows-x86_64': [
      'liao-tools_' + version + '_x64-setup.exe',
      'liao-tools_' + version + '_x64_en-US.msi',
    ],
    'darwin-x86_64': ['liao-tools_x64.app.tar.gz'],
    'darwin-aarch64': ['liao-tools_aarch64.app.tar.gz'],
  };
}
function isTrustedAsset(tag, asset) {
  if (!asset || !Number.isSafeInteger(asset.size) || asset.size <= 0) return false;
  if (typeof asset.name !== 'string' || asset.name.includes('/') || asset.name.includes('\\')) return false;
  if (typeof asset.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest)) return false;
  if (typeof asset.browser_download_url !== 'string') return false;
  try {
    const url = new URL(asset.browser_download_url);
    const prefix = '/' + REPO + '/releases/download/' + tag + '/';
    return url.protocol === 'https:' && url.hostname === 'github.com' &&
      url.port === '' && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === prefix + encodeURIComponent(asset.name).replace(/%2E/gi, '.');
  } catch {
    return false;
  }
}
function buildSignedManifest(tag, assets, signatures, options = {}) {
  if (!TAG.test(tag)) throw new Error('Only stable vMAJOR.MINOR.PATCH tags are allowed');
  if (!Array.isArray(assets) || typeof signatures !== 'object' || signatures === null) {
    throw new Error('Release assets and signature files are required');
  }
  const version = tag.slice(1);
  const platforms = {};
  for (const [target, candidates] of Object.entries(expectedTargets(version))) {
    let selected = null;
    for (const name of candidates) {
      const matching = assets.filter(a => a.name === name);
      if (matching.length > 1) throw new Error('Duplicate artifact: ' + name);
      if (matching.length === 1 && isTrustedAsset(tag, matching[0])) {
        const signatureFileName = name + '.sig';
        const file = signatures[signatureFileName];
        if (typeof file !== 'string') throw new Error('Missing updater signature: ' + signatureFileName);
        const signature = file.trim();
        // Tauri sig files contain an encoded signed payload, not a filename or URL.
        // This is only syntactic validation; the official updater does the crypto.
        if (signature.length < 72 || !/^[a-zA-Z0-9+/=]+$/.test(signature)) {
          throw new Error('Invalid updater signature content: ' + signatureFileName);
        }
        selected = { signature, url: matching[0].browser_download_url };
        break;
      } else if (matching.length === 1) {
        throw new Error('Untrusted or invalid GitHub asset: ' + name);
      }
    }
    if (!selected) throw new Error('Missing signed updater package for: ' + target);
    platforms[target] = selected;
  }
  const manifest = {
    version,
    notes: typeof options.notes === 'string' ? options.notes : '',
    platforms,
  };
  if (options.pub_date !== undefined) {
    if (typeof options.pub_date !== 'string' || Number.isNaN(Date.parse(options.pub_date))) {
      throw new Error('Invalid pub_date (expected RFC3339 date)');
    }
    manifest.pub_date = options.pub_date;
  }
  return manifest;
}


/** Verify the actual signed manifest points to release packages and preserves .sig bytes.
 * This is structural validation, not cryptographic signature verification.
 */
function verifySignedManifest(tag, assets, signatures, manifest) {
  const issues = [];
  if (!TAG.test(tag) || !manifest || typeof manifest !== 'object')
    return { ok: false, issues: ['Invalid tag or manifest'] };
  const version = tag.slice(1), targets = expectedTargets(version);
  if (manifest.version !== version) issues.push('Manifest version differs from Release tag');
  const platforms = manifest.platforms;
  if (!platforms || Array.isArray(platforms) || typeof platforms !== 'object')
    return { ok: false, issues: ['Manifest platforms missing'] };
  for (const target of Object.keys(platforms))
    if (!Object.hasOwn(targets, target)) issues.push('Unexpected platform: ' + target);
  for (const [target, names] of Object.entries(targets)) {
    const entry = platforms[target];
    if (!entry || typeof entry !== 'object') {
      issues.push('Missing platform: ' + target);
      continue;
    }
    const matches = assets.filter(a => names.includes(a.name) && a.browser_download_url === entry.url);
    if (matches.length !== 1 || !isTrustedAsset(tag, matches[0])) {
      issues.push('Untrusted URL or missing package for ' + target);
      continue;
    }
    const actualSignature = signatures[matches[0].name + '.sig'];
    if (typeof actualSignature !== 'string' || actualSignature.trim() !== entry.signature ||
        typeof entry.signature !== 'string' || entry.signature.length < 72 ||
        !/^[a-zA-Z0-9+/=]+$/.test(entry.signature)) {
      issues.push('Signature contents disagree with published file for ' + target);
    }
  }
  return { ok: issues.length === 0, issues, version };
}

function main() {
  const [, , tag, assetsPath, signatureDir, outputPath] = process.argv;
  if (!tag || !assetsPath || !signatureDir || !outputPath) {
    console.error('Usage: node scripts/build-signed-updater-manifest.cjs <tag> <assets.json> <signatures-dir> <output.json>');
    process.exitCode = 2;
    return;
  }
  try {
    const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
    const names = expectedTargets(tag.slice(1));
    const signatures = Object.fromEntries(
      [...new Set(Object.values(names).flat())].flatMap(name => {
        const filename = name + '.sig';
        const location = path.join(signatureDir, filename);
        return fs.existsSync(location) ? [[filename, fs.readFileSync(location, 'utf8')]] : [];
      })
    );
    const manifest = buildSignedManifest(tag, assets, signatures);
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    console.log('Generated Tauri v2 signed manifest: ' + outputPath);
  } catch (error) {
    console.error('Signed manifest generation rejected: ' + error.message);
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { expectedTargets, isTrustedAsset, buildSignedManifest, verifySignedManifest };
