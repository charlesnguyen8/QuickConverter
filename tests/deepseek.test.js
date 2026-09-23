const assert = require('assert');
const path = require('path');

console.log('--- Running DeepSeek Cost & Pricing Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const DeepSeekService = require(path.join(repoRoot, 'src', 'services', 'deepseek.js'));

// Test 1: DeepSeek Peak vs Off-Peak Schedule Determination
// Monday 02:00 UTC (Peak)
const monPeak1 = new Date(Date.UTC(2026, 8, 21, 2, 0, 0));
const status1 = DeepSeekService.getPricingStatus(monPeak1);
assert.strictEqual(status1.isPeak, true, 'Monday 02:00 UTC should be Peak');
assert.strictEqual(status1.multiplier, 1.0);
assert.strictEqual(status1.label, 'Peak Hours');

// Monday 05:00 UTC (Off-Peak)
const monOffPeak = new Date(Date.UTC(2026, 8, 21, 5, 0, 0));
const status2 = DeepSeekService.getPricingStatus(monOffPeak);
assert.strictEqual(status2.isPeak, false, 'Monday 05:00 UTC should be Off-Peak');
assert.strictEqual(status2.multiplier, 0.5);
assert.strictEqual(status2.discountPercent, 50);

// Saturday 02:00 UTC (Weekend = Off-Peak)
const satOffPeak = new Date(Date.UTC(2026, 8, 26, 2, 0, 0));
const status3 = DeepSeekService.getPricingStatus(satOffPeak);
assert.strictEqual(status3.isPeak, false, 'Saturday 02:00 UTC should be Off-Peak');
assert.strictEqual(status3.multiplier, 0.5);
console.log('✓ UTC Peak vs Off-Peak schedule rules verified');

// Test 2: Cost Calculation with Context Cache Hits
const sampleUsage = {
  prompt_tokens: 1800,
  prompt_cache_hit_tokens: 1000,
  prompt_cache_miss_tokens: 800,
  completion_tokens: 2500,
  total_tokens: 4300
};

// deepseek-flash during Peak
const flashPeak = DeepSeekService.calculateCost(sampleUsage, 'deepseek-flash', monPeak1);
const expectedFlashPeak = (1000 * 0.006 + 800 * 0.30 + 2500 * 1.20) / 1000000;
assert.strictEqual(flashPeak.isPeak, true);
assert.ok(Math.abs(flashPeak.costUSD - expectedFlashPeak) < 1e-9);
assert.strictEqual(flashPeak.formattedCost, `$${expectedFlashPeak.toFixed(4)}`);
assert.strictEqual(flashPeak.promptTokens, 1800);
assert.strictEqual(flashPeak.cacheHitTokens, 1000);
assert.strictEqual(flashPeak.completionTokens, 2500);

// deepseek-flash during Off-Peak (50% discount)
const flashOffPeak = DeepSeekService.calculateCost(sampleUsage, 'deepseek-flash', monOffPeak);
const expectedFlashOffPeak = (1000 * 0.003 + 800 * 0.15 + 2500 * 0.60) / 1000000;
assert.strictEqual(flashOffPeak.isPeak, false);
assert.strictEqual(flashOffPeak.discountPercent, 50);
assert.strictEqual(flashOffPeak.ratePeriod, 'Off-Peak (50% Off)');
assert.ok(Math.abs(flashOffPeak.costUSD - expectedFlashOffPeak) < 1e-9);
assert.strictEqual(flashOffPeak.formattedCost, `$${expectedFlashOffPeak.toFixed(4)}`);

console.log('✓ Request token cost calculation and cache savings verified');
console.log('🎉 DeepSeek Cost & Pricing Test Suite: ALL TESTS PASSED!\n');
