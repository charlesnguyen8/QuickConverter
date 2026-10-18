const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

console.log('--- Running Android Release Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

(async () => {
  const { androidVersion } = await import(pathToFileURL(path.join(repoRoot, 'android-version.mjs')).href);

  assert.deepStrictEqual(androidVersion('v1.1.0'), { name: '1.1.0', code: 1001000 });
  assert.deepStrictEqual(androidVersion('refs/tags/v2.0.13'), { name: '2.0.13', code: 2000013 });
  assert.deepStrictEqual(androidVersion('1.0.1'), { name: '1.0.1', code: 1000001 });
  assert(androidVersion('v1.0.0').code > 1, 'the first release outranks the versionCode 1 debug builds');
  assert(androidVersion('v1.10.0').code > androidVersion('v1.9.99').code, 'codes grow with the version');
  assert(androidVersion('v2.0.0').code > androidVersion('v1.999.999').code);
  for (const bad of ['', 'latest', 'v1.2', 'v1.2.3-beta', 'v1.1000.0', 'v1.0.1000']) {
    assert.throws(() => androidVersion(bad), /version tag/i, `rejects ${JSON.stringify(bad)}`);
  }
  console.log('✓ Release tags map to Android versionName/versionCode');

  const out = execFileSync(process.execPath, [path.join(repoRoot, 'android-version.mjs'), 'v1.2.3'], { encoding: 'utf8' });
  assert.deepStrictEqual(out.trim().split(/\r?\n/), ['QC_VERSION_NAME=1.2.3', 'QC_VERSION_CODE=1002003']);
  console.log('✓ android-version.mjs prints GITHUB_ENV lines');

  const gradle = read('android', 'app', 'build.gradle');
  for (const env of ['QC_VERSION_CODE', 'QC_VERSION_NAME', 'QC_KEYSTORE_PATH', 'QC_KEYSTORE_PASSWORD', 'QC_KEY_ALIAS', 'QC_KEY_PASSWORD']) {
    assert(gradle.includes(`System.getenv('${env}')`), `build.gradle reads ${env}`);
  }
  assert(/release\s*\{[^}]*signingConfig\s+signingConfigs\.release/.test(gradle), 'release builds are signed with the release key');
  console.log('✓ Gradle takes the version and release key from the environment');

  const workflow = read('.github', 'workflows', 'android-release.yml');
  assert(/tags:\s*\n\s*-\s*['"]?v\*/.test(workflow), 'runs on v* tags');
  assert(/contents:\s*write/.test(workflow), 'may create releases');
  for (const secret of ['QC_KEYSTORE_BASE64', 'QC_KEYSTORE_PASSWORD', 'QC_KEY_ALIAS', 'QC_KEY_PASSWORD']) {
    assert(workflow.includes(`secrets.${secret}`), `uses the ${secret} secret`);
  }
  const order = ['npm test', 'npm run build:app', 'npx cap sync android', 'assembleRelease'].map((step) => workflow.indexOf(step));
  assert(order.every((i) => i !== -1), 'tests, builds the app, syncs and assembles the release APK');
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'tests run before anything is built');
  assert(/\.apk/.test(workflow) && /action-gh-release|gh release/.test(workflow), 'attaches the APK to a GitHub release');
  console.log('✓ The release workflow tests, builds, signs and publishes the APK');

  const ignored = read('.gitignore');
  assert(/^release-keys\/$/m.test(ignored), 'the release key folder is never committed');
  assert(/^\*\.jks$/m.test(ignored) && /^\*\.keystore$/m.test(ignored), 'no keystore is ever committed');
  console.log('✓ Release keys stay out of git');

  console.log('🎉 Android Release Test Suite: ALL TESTS PASSED!');
})().catch((err) => {
  console.error('✗ Release test failed:', err.message);
  process.exit(1);
});
