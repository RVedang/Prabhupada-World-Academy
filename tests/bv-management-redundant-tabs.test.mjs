import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const managementSource = readFileSync(
  new URL('../src/components/guide/BvslManagementTab.tsx', import.meta.url),
  'utf8',
);

test('BV Management omits duplicate Sadhana monitoring tabs', () => {
  assert.doesNotMatch(managementSource, /TabsTrigger value="monitor"/);
  assert.doesNotMatch(managementSource, /TabsTrigger value="missing"/);
  assert.doesNotMatch(managementSource, /BvSadhanaMonitorPanel/);
  assert.doesNotMatch(managementSource, /BvMissingSadhanaPanel/);
});

test('BV Management keeps its distinct administration tabs', () => {
  assert.match(managementSource, /TabsTrigger value="bvsls"/);
  assert.match(managementSource, /TabsTrigger value="groups"/);
  assert.match(managementSource, /TabsTrigger value="data"/);
});
