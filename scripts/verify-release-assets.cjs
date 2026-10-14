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
module.exports = { checkRelease, expectedAssets };
