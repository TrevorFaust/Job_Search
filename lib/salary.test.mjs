import { parseSalary, formatAnnualSalary, HOURS_PER_YEAR } from './salary.js';

const tests = [
  { input: '$15-20/hr', expect: { min: 28800, max: 38400 } },
  { input: '$15 - $20 per hour', expect: { min: 28800, max: 38400 } },
  { input: '$80,000 - $100,000 /yr', expect: { min: 80000, max: 100000 } },
  { input: 'USD 100,000.00 - 135,000.00 per year', expect: { min: 100000, max: 135000 } },
];

let passed = 0;
for (const t of tests) {
  const r = parseSalary(t.input);
  const ok = r?.min === t.expect.min && r?.max === t.expect.max;
  console.log(`${ok ? '✓' : '✗'} ${t.input} → ${r?.min}-${r?.max} (want ${t.expect.min}-${t.expect.max})`);
  if (ok) passed++;
}
console.log(`\nHOURS_PER_YEAR = ${HOURS_PER_YEAR}`);
console.log(`format: ${formatAnnualSalary(28800, 38400)}`);
console.log(`\n${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
