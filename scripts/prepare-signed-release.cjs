'use strict';
/**
 * The signed release flag is deliberately fail-closed.
 * Never publish "signed updater" assets before the official plugin, public key
 * and signer secrets are all configured. Never log secret values.
 */
const fs = require('node:fs');
const path = require('node:path');
function prepareSignedRelease(root, options) {
  if (!options?.enabled) return { signed: false, reason: 'manual-update channel remains enabled' };
  if (typeof options.privateKey !== 'string' || !options.privateKey.trim()) {
    throw new Error('TAURI_SIGNING_PRIVATE_KEY secret is required');
  }
  if (typeof options.pubkey !== 'string' || options.pubkey.trim().length < 40) {
    throw new Error('TAURI_UPDATER_PUBLIC_KEY repository variable is missing or invalid');
  }
  const cargo = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!/^\s*tauri-plugin-updater\s*=/m.test(cargo) ||
      !lib.includes('tauri_plugin_updater::') ||
      !pkg.dependencies?.['@tauri-apps/plugin-updater']) {
    throw new Error('Official signed Tauri updater plugin must be fully registered before signed releases');
  }
  const target = path.join(root, 'src-tauri/tauri.conf.json');
  const config = JSON.parse(fs.readFileSync(target, 'utf8'));
  config.bundle = { ...config.bundle, createUpdaterArtifacts: true };
  config.plugins = {
    ...config.plugins,
    updater: {
      pubkey: options.pubkey.trim(),
      endpoints: [
        'https://github.com/liao-works/liao-tools/releases/latest/download/latest.json',
      ],
      windows: { installMode: 'basicUi' },
    },
  };
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
  return { signed: true, configPath: target };
}
if (require.main === module) {
  try {
    const result = prepareSignedRelease(process.cwd(), {
      enabled: process.env.REQUIRE_SIGNED_UPDATER === 'true',
      privateKey: process.env.TAURI_SIGNING_PRIVATE_KEY,
      pubkey: process.env.TAURI_UPDATER_PUBLIC_KEY,
    });
    console.log(result.signed ? 'Signed artifact mode configured' : 'Legacy user-confirmed update mode');
  } catch (error) {
    console.error('Release preflight rejected: ' + error.message);
    process.exitCode = 1;
  }
}
module.exports = { prepareSignedRelease };
