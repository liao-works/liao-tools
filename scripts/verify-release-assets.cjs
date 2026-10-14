/**
 * Validate a complete cross-platform GitHub Release before publishing.
 * No network and no dependency: usable by CI, unit tests and release job.
 */
'use strict';
const VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function expectedAssets(version) {
  return [
    'liao-tools_' + version + '_x64-setup.exe',
    'liao-tools_' + version + '_x64_en-US.msi',
    'liao-tools_' + version + '_aarch64.dmg',
    'liao-tools_' + version + '_x64.dmg',
    'liao-tools_' + version + '_universal.dmg',
  ];
}
function checkRelease(tag, assets) {
  if (!VERSION.test(tag)) {
    return { ok: false, issues: ['发布标签必须使用 vMAJOR.MINOR.PATCH 格式'] };
  }
  const version = tag.substring(1);
  const problems = [];
  for (const name of expectedAssets(version)) {
    const matched = assets.filter(asset => asset.name === name);
    if (matched.length !== 1) {
      problems.push(name + ': 未找到唯一的发布资产');
      continue;
    }
    const asset = matched[0];
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0) {
      problems.push(name + ': 文件大小无效');
    }
    if (typeof asset.digest !== 'string' || !/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)) {
      problems.push(name + ': 缺失有效 SHA-256');
    }
    if (typeof asset.browser_download_url !== 'string' ||
      !asset.browser_download_url.startsWith('https://github.com/liao-works/liao-tools/releases/download/' + tag + '/')) {
      problems.push(name + ': 下载地址不属于当前官方 Release');
    }
  }
  return { ok: problems.length === 0, issues: problems, version };
}
/**
 * Additional fail-closed packaging gate. These metadata checks DO NOT verify
 * minisign/Ed25519 signatures; that is the Tauri updater plugin's responsibility.
 */
function checkSignedReleaseAssets(tag, assets) {
  const basic = checkRelease(tag, assets);
  if (!basic.ok) return basic;
  const version = basic.version;
  const packages = [
    ['windows-x86_64', [
      'liao-tools_' + version + '_x64-setup.exe',
      'liao-tools_' + version + '_x64_en-US.msi',
    ]],
    ['darwin-x86_64', ['liao-tools_x64.app.tar.gz']],
    ['darwin-aarch64', ['liao-tools_aarch64.app.tar.gz']],
  ];
  const issues = [];
  for (const [platform, candidates] of packages) {
    const found = candidates.some(name => {
      const artifact = assets.find(item => item.name === name);
      const signatures = assets.filter(item => item.name === name + '.sig');
      return artifact && signatures.length === 1 &&
        signatures[0].size > 0 &&
        /^sha256:[a-f0-9]{64}$/i.test(signatures[0].digest || '') &&
        signatures[0].browser_download_url ===
          'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/' + name + '.sig';
    });
    if (!found) issues.push(platform + ': 缺少与对应更新包配对的签名资产');
  }
  const jsons = assets.filter(a => a.name === 'latest.json');
  if (jsons.length !== 1 || jsons[0].size <= 0 ||
      !/^sha256:[a-f0-9]{64}$/i.test(jsons[0].digest || '') ||
      jsons[0].browser_download_url !==
        'https://github.com/liao-works/liao-tools/releases/download/' + tag + '/latest.json') {
    issues.push('latest.json: 缺少正式签名更新清单');
  }
  return { ok: issues.length === 0, issues, version };
}
module.exports = { checkRelease, expectedAssets, checkSignedReleaseAssets };
