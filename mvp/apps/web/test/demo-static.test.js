import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rootFile = relative => new URL(`../../../../${relative}`, import.meta.url);

test('static demonstrator exposes semantic skip navigation and an accessible mobile drawer contract', async () => {
  const html = await readFile(rootFile('index.html'), 'utf8');
  assert.match(html, /class="skip-link"/);
  assert.match(html, /id="mainContent"/);
  assert.match(html, /aria-controls="sideNav"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /id="liveRegion"[^>]*aria-live="polite"/);
  assert.match(html, /viewport-fit=cover/);
});

test('responsive CSS keeps every navigation item reachable and hardens keyboard/touch accessibility', async () => {
  const css = await readFile(rootFile('styles.css'), 'utf8');
  assert.match(css, /@media \(max-width:1199px\)/);
  assert.match(css, /@media \(max-width:767px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /nav button:nth-child/);
});

test('demo includes full responsive/localization review artifacts and stable machine-code presentation', async () => {
  const js = await readFile(rootFile('app.js'), 'utf8');
  assert.match(js, /Responsive_Matrix\.csv/);
  assert.match(js, /Localization_Matrix\.csv/);
  assert.match(js, /BOOKING_CONFLICT/);
  assert.match(js, /Africa\/Douala/);
  assert.match(js, /fr-CM/);
  assert.match(js, /en-CM/);
});
