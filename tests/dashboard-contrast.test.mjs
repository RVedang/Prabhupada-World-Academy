import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardLayoutPath = new URL('../src/layouts/DashboardLayout.tsx', import.meta.url);
const tabTransitionPath = new URL('../src/components/TabTransition.tsx', import.meta.url);

test('shared dashboard surfaces never fade the complete content tree', async () => {
  const [layout, tabs] = await Promise.all([
    readFile(dashboardLayoutPath, 'utf8'),
    readFile(tabTransitionPath, 'utf8'),
  ]);

  assert.match(layout, /<main className=\{`dashboard-main/);
  assert.doesNotMatch(layout, /<motion\.main/);
  assert.doesNotMatch(layout, /initial=.*opacity/);
  assert.match(tabs, /<div className="w-full h-full min-w-0" data-active-tab/);
  assert.doesNotMatch(tabs, /controls\.set\(\{\s*opacity/);
  assert.doesNotMatch(tabs, /motion\.div/);
});
