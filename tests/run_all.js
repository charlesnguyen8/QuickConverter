const { execSync } = require('child_process');
const path = require('path');

console.log('====================================================');
console.log('   QuickConverter Automated Test Suite Runner       ');
console.log('====================================================\n');

const testFiles = [
  'typography.test.js',
  'settings.test.js',
  'reader.test.js',
  'deepseek.test.js',
  'bridge.test.js'
];

let allPassed = true;
const startTime = Date.now();

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  try {
    execSync(`node "${filePath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Test suite failed: ${file}`);
    allPassed = false;
    break;
  }
}

const elapsedMs = Date.now() - startTime;

console.log('====================================================');
if (allPassed) {
  console.log(`✅ ALL ${testFiles.length} TEST SUITES PASSED SUCCESSFULLY! (${elapsedMs}ms)`);
  console.log('====================================================');
  process.exit(0);
} else {
  console.error(`❌ TEST RUN FAILED! (${elapsedMs}ms)`);
  console.log('====================================================');
  process.exit(1);
}
