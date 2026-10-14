'use strict';
const fs = require('node:fs');
const STABLE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
// Compare components as BigInt to avoid overflow or lexicographic ordering.
function parseVersion(tag) {
  const match = typeof tag === 'string' ? STABLE.exec(tag) : null;
  return match ? match.slice(1).map(value => BigInt(value)) : null;
}
function compareVersions(a,b) {
  for (let i=0; i<3; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}
function normalizeReleaseResponse(input) {
  if (!Array.isArray(input)) throw new Error('Expected a complete JSON list of Releases');
  const releases = input.flatMap(item => Array.isArray(item) ? item : [item]);
  if (releases.some(item => !item || typeof item !== 'object' ||
      typeof item.tag_name !== 'string' || typeof item.draft !== 'boolean' ||
      typeof item.prerelease !== 'boolean')) {
    throw new Error('GitHub Releases metadata is incomplete; publication refused');
  }
  return releases;
}
function verifyReleaseVersion(candidate, rawReleases, options = {}) {
  const target = parseVersion(candidate);
  if (!target) return { ok:false, reason:'Release tag must be stable vMAJOR.MINOR.PATCH' };
  const releases = normalizeReleaseResponse(rawReleases);
  if (releases.some(r=>!r.draft && r.tag_name===candidate))
    return { ok:false, reason:candidate+' is already public; cannot overwrite an existing Release' };
  // Once a public stable release contains the official signed updater manifest,
  // unsigned successors would strand already-installed signed clients.
  if (options.requireSigned === false) {
    for (const release of releases) {
      if (release.draft || release.prerelease || !parseVersion(release.tag_name)) continue;
      if (!Array.isArray(release.assets)) {
        return { ok:false, reason:'Cannot verify signing-channel continuity from incomplete assets metadata' };
      }
      if (release.assets.some(asset => asset && asset.name === 'latest.json')) {
        return { ok:false,
          reason:'Signed updater channel already launched at '+release.tag_name+
            '; unsigned publication would break existing signed clients' };
      }
    }
  }
  let highest=null, highestTag=null;
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const version = parseVersion(release.tag_name);
    if (!version) continue;
    if (!highest || compareVersions(version,highest)>0) {
      highest=version; highestTag=release.tag_name;
    }
  }
  if (highest && compareVersions(target, highest)<=0)
    return {ok:false,highestPublic:highestTag,
      reason:candidate+' must be strictly greater than public stable '+highestTag};
  return {ok:true,highestPublic:highestTag,candidate};
}
if (require.main===module) {
  const [, , tag, jsonPath]=process.argv;
  if (!tag || !jsonPath) {
    console.error('Usage: node scripts/release-version-gate.cjs <tag> <releases.json>');
    process.exitCode=2;
  } else {
    try {
      const result=verifyReleaseVersion(tag,JSON.parse(fs.readFileSync(jsonPath,'utf8')), {
        requireSigned:process.env.REQUIRE_SIGNED_UPDATER==='true'
      });
      if (!result.ok) throw new Error(result.reason);
      console.log('Version gate passed: '+tag+' > '+(result.highestPublic||'(none)'));
    } catch(error) {
      console.error('Release version gate refused publication: '+error.message);
      process.exitCode=1;
    }
  }
}
module.exports={parseVersion,compareVersions,normalizeReleaseResponse,verifyReleaseVersion};
