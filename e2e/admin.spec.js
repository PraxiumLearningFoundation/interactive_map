const { test, expect } = require('@playwright/test');
const { ORGANIZATIONS, CATEGORIES, stubExternalAssets } = require('./fixtures');

// The admin portal sits behind Azure SWA auth and talks to /api/*. Tests fake
// both: a stateful in-memory backend records what the page sends.
async function mockAdminApi(page, overrides = {}) {
  const backend = {
    organizations: structuredClone(ORGANIZATIONS),
    version: 'v1',
    publishRequests: [],
    geocodeRequests: [],
  };

  await stubExternalAssets(page);
  await page.route('**/.auth/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<p>auth: ${new URL(route.request().url()).pathname}</p>` }));

  await page.route('**/api/gist', (route) => {
    if (overrides.gist) return overrides.gist(route, backend);
    return route.fulfill({
      json: {
        organizations: backend.organizations,
        categories: CATEGORIES,
        version: backend.version,
        updatedAt: '2026-10-01T12:00:00Z',
      },
    });
  });

  await page.route('**/api/publish', (route) => {
    const body = route.request().postDataJSON();
    backend.publishRequests.push(body);
    if (overrides.publish) return overrides.publish(route, backend, body);

    if (body.mode === 'create') {
      const id = Math.max(...backend.organizations.map((o) => o.id)) + 1;
      backend.organizations.push({ ...body.org, id });
    } else if (body.mode === 'update') {
      backend.organizations = backend.organizations.map((o) => (o.id === body.orgId ? { ...body.org, id: o.id } : o));
    } else if (body.mode === 'delete') {
      backend.organizations = backend.organizations.filter((o) => o.id !== body.orgId);
    }
    backend.version = `v${Number(backend.version.slice(1)) + 1}`;
    return route.fulfill({ json: { ok: true, version: backend.version } });
  });

  await page.route('**/api/geocode', (route) => {
    const body = route.request().postDataJSON();
    backend.geocodeRequests.push(body);
    if (overrides.geocode) return overrides.geocode(route, backend, body);
    return route.fulfill({ json: { lat: 51.5072, lng: -0.1276, displayName: 'London, Greater London, England' } });
  });

  return backend;
}

async function openAdmin(page, overrides) {
  const backend = await mockAdminApi(page, overrides);
  await page.goto('/admin/');
  await expect(page.locator('#org-list .org-card')).toHaveCount(backend.organizations.length);
  return backend;
}

async function fillRequiredFields(page, { name = 'Thames Learning Hub' } = {}) {
  await page.locator('#org-name').fill(name);
  await page.locator('#org-website').fill('https://thames.example.org');
  await page.locator('#org-location').fill('London, UK');
  await page.locator('#org-lat').fill('51.5072');
  await page.locator('#org-lng').fill('-0.1276');
  await page.locator('#org-category').selectOption('Health');
  await page.locator('#org-description').fill('Adult learning programmes.');
}

test.describe('admin portal', () => {
  test('lists organizations alphabetically with last-updated time', async ({ page }) => {
    await openAdmin(page);
    await expect(page.locator('#org-list .org-card strong')).toHaveText([
      'Highland Health Network',
      'Praxium Learning Foundation',
      'Riverbank Arts Collective',
    ]);
    await expect(page.locator('#last-updated')).toContainText('Last updated:');
  });

  test('search filters by name and category', async ({ page }) => {
    await openAdmin(page);
    await page.locator('#org-search').fill('riverbank');
    await expect(page.locator('#org-list .org-card')).toHaveCount(1);
    await page.locator('#org-search').fill('health');
    await expect(page.locator('#org-list .org-card strong')).toHaveText(['Highland Health Network']);
    await page.locator('#org-search').fill('');
    await expect(page.locator('#org-list .org-card')).toHaveCount(3);
  });

  test('redirects to login when the API says 401', async ({ page }) => {
    await mockAdminApi(page, { gist: (route) => route.fulfill({ status: 401, body: '' }) });
    await page.goto('/admin/');
    await expect(page).toHaveURL(/\/\.auth\/login\/aad$/);
  });

  test('shows an error banner when data fails to load', async ({ page }) => {
    await mockAdminApi(page, { gist: (route) => route.fulfill({ status: 500, body: '' }) });
    await page.goto('/admin/');
    await expect(page.locator('#admin-banner')).toHaveText('Failed to load organization data. Please refresh the page.');
    await expect(page.locator('#admin-banner')).toHaveClass('error');
  });

  test('log out goes to the SWA logout endpoint', async ({ page }) => {
    await openAdmin(page);
    await page.locator('#logout-btn').click();
    await expect(page).toHaveURL(/\/\.auth\/logout$/);
  });

  test('add form opens empty and cancel returns to the list', async ({ page }) => {
    await openAdmin(page);
    await page.locator('#add-org-btn').click();

    await expect(page.locator('#form-title')).toHaveText('Add Organization');
    await expect(page.locator('#org-list-panel')).toBeHidden();
    await expect(page.locator('#org-name')).toHaveValue('');
    await expect(page.locator('#delete-btn')).toBeHidden();
    await expect(page.locator('#preview-map.leaflet-container')).toBeVisible();
    // Connections list offers every existing org when creating.
    await expect(page.locator('#org-connections option')).toHaveCount(3);

    await page.locator('#cancel-btn').click();
    await expect(page.locator('#org-form-panel')).toBeHidden();
    await expect(page.locator('#org-list-panel')).toBeVisible();
  });

  test('creates an organization and publishes the expected payload', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('#add-org-btn').click();
    await fillRequiredFields(page);
    await page.locator('#org-email').fill('hello@thames.example.org');
    await page.locator('#org-country').fill('United Kingdom');
    await page.locator('#org-relationship').fill('Co-hosts our dialogue circles.');
    await page.locator('#org-connections').selectOption(['1', '3']);

    await page.locator('#save-btn').click();

    await expect(page.locator('#admin-banner')).toHaveText('Published successfully.');
    await expect(page.locator('#org-list .org-card')).toHaveCount(4);
    await expect(page.locator('#org-list')).toContainText('Thames Learning Hub');

    expect(backend.publishRequests).toHaveLength(1);
    expect(backend.publishRequests[0]).toEqual({
      mode: 'create',
      expectedVersion: 'v1',
      org: {
        name: 'Thames Learning Hub',
        location: 'London, UK',
        country: 'United Kingdom',
        coordinates: [51.5072, -0.1276],
        category: 'Health',
        allowCustomCategory: false,
        description: 'Adult learning programmes.',
        relationship: 'Co-hosts our dialogue circles.',
        contact: { website: 'https://thames.example.org', email: 'hello@thames.example.org', phone: '' },
        connections: [3, 1], // option order: sorted by name
      },
    });
  });

  test('browser validation blocks publishing without required fields', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('#add-org-btn').click();
    await page.locator('#save-btn').click();
    await expect(page.locator('#org-form-panel')).toBeVisible();
    expect(await page.locator('#org-name').evaluate((el) => el.validity.valueMissing)).toBe(true);
    expect(backend.publishRequests).toHaveLength(0);
  });

  test('custom category is sent with allowCustomCategory', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('#add-org-btn').click();
    await fillRequiredFields(page);

    await expect(page.locator('#custom-category-wrap')).toBeHidden();
    await page.locator('#org-category').selectOption('custom');
    await expect(page.locator('#custom-category-wrap')).toBeVisible();
    await page.locator('#org-category-custom').fill('Faith Communities');
    await page.locator('#save-btn').click();

    await expect(page.locator('#admin-banner')).toHaveText('Published successfully.');
    expect(backend.publishRequests[0].org).toMatchObject({ category: 'Faith Communities', allowCustomCategory: true });
  });

  test('edit form is prefilled and publishes an update', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('.org-card', { hasText: 'Riverbank Arts Collective' }).getByRole('button', { name: 'Edit' }).click();

    await expect(page.locator('#form-title')).toHaveText('Edit Organization');
    await expect(page.locator('#org-name')).toHaveValue('Riverbank Arts Collective');
    await expect(page.locator('#org-website')).toHaveValue('https://riverbank.example.org/');
    await expect(page.locator('#org-lat')).toHaveValue('43.6532');
    await expect(page.locator('#org-category')).toHaveValue('Arts');
    await expect(page.locator('#description-count')).toHaveText('31');
    await expect(page.locator('#delete-btn')).toBeVisible();
    // An org can't connect to itself; its existing link is preselected.
    await expect(page.locator('#org-connections option')).toHaveText(['Highland Health Network', 'Praxium Learning Foundation']);
    await expect(page.locator('#org-connections')).toHaveValues(['1']);

    await page.locator('#org-name').fill('Riverbank Arts & Culture Collective');
    await page.locator('#save-btn').click();

    await expect(page.locator('#admin-banner')).toHaveText('Published successfully.');
    await expect(page.locator('#org-list')).toContainText('Riverbank Arts & Culture Collective');
    expect(backend.publishRequests[0]).toMatchObject({ mode: 'update', orgId: 2, expectedVersion: 'v1' });
  });

  test('character counters track description and relationship', async ({ page }) => {
    await openAdmin(page);
    await page.locator('#add-org-btn').click();
    await page.locator('#org-description').fill('12345');
    await expect(page.locator('#description-count')).toHaveText('5');
    await page.locator('#org-relationship').fill('abc');
    await expect(page.locator('#relationship-count')).toHaveText('3');
  });

  test('deletes an organization after confirmation', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('.org-card', { hasText: 'Highland Health Network' }).getByRole('button', { name: 'Edit' }).click();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#delete-btn').click();

    await expect(page.locator('#admin-banner')).toHaveText('Organization deleted.');
    await expect(page.locator('#org-list .org-card')).toHaveCount(2);
    expect(backend.publishRequests).toEqual([{ mode: 'delete', orgId: 3, expectedVersion: 'v1' }]);
  });

  test('dismissing the delete confirmation does nothing', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('.org-card', { hasText: 'Highland Health Network' }).getByRole('button', { name: 'Edit' }).click();

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#delete-btn').click();

    await expect(page.locator('#org-form-panel')).toBeVisible();
    expect(backend.publishRequests).toHaveLength(0);
  });

  test('geocode lookup fills coordinates', async ({ page }) => {
    const backend = await openAdmin(page);
    await page.locator('#add-org-btn').click();

    await page.locator('#geocode-btn').click();
    await expect(page.locator('#geocode-status')).toHaveText('Enter an address first.');
    expect(backend.geocodeRequests).toHaveLength(0);

    await page.locator('#org-location').fill('London');
    await page.locator('#geocode-btn').click();
    await expect(page.locator('#geocode-status')).toHaveText('Matched: London, Greater London, England');
    await expect(page.locator('#org-lat')).toHaveValue('51.507200');
    await expect(page.locator('#org-lng')).toHaveValue('-0.127600');
    expect(backend.geocodeRequests).toEqual([{ address: 'London' }]);
  });

  test('geocode reports no match and failures', async ({ page }) => {
    let status = 404;
    await openAdmin(page, { geocode: (route) => route.fulfill({ status, json: {} }) });
    await page.locator('#add-org-btn').click();
    await page.locator('#org-location').fill('Nowhere');

    await page.locator('#geocode-btn').click();
    await expect(page.locator('#geocode-status')).toHaveText('No match found — enter coordinates manually.');

    status = 502;
    await page.locator('#geocode-btn').click();
    await expect(page.locator('#geocode-status')).toHaveText('Lookup failed — enter coordinates manually.');
  });

  test('shows server validation errors', async ({ page }) => {
    await openAdmin(page, {
      publish: (route) => route.fulfill({
        status: 400,
        json: { error: 'Validation failed', details: ['name is too long', 'website must be https'] },
      }),
    });
    await page.locator('#add-org-btn').click();
    await fillRequiredFields(page);
    await page.locator('#save-btn').click();

    await expect(page.locator('#form-error')).toHaveText('Please fix: name is too long; website must be https');
    await expect(page.locator('#save-btn')).toHaveText('Publish');
    await expect(page.locator('#save-btn')).toBeEnabled();
  });

  test('version conflict keeps the form open and retries with the new version', async ({ page }) => {
    let conflict = true;
    const backend = await openAdmin(page, {
      publish: (route) => {
        if (conflict) {
          conflict = false;
          return route.fulfill({
            status: 409,
            json: { message: 'Someone else published changes first.', currentVersion: 'v7' },
          });
        }
        return route.fulfill({ json: { ok: true } });
      },
    });
    await page.locator('#add-org-btn').click();
    await fillRequiredFields(page);

    await page.locator('#save-btn').click();
    await expect(page.locator('#form-error')).toHaveText('Someone else published changes first.');
    await expect(page.locator('#org-form-panel')).toBeVisible();

    await page.locator('#save-btn').click();
    await expect(page.locator('#admin-banner')).toHaveText('Published successfully.');
    expect(backend.publishRequests.map((r) => r.expectedVersion)).toEqual(['v1', 'v7']);
  });

  test('network failure while publishing shows an error', async ({ page }) => {
    await openAdmin(page, { publish: (route) => route.abort('failed') });
    await page.locator('#add-org-btn').click();
    await fillRequiredFields(page);
    await page.locator('#save-btn').click();
    await expect(page.locator('#form-error')).toHaveText('Publish failed: could not reach the server.');
  });

  test('escapes organization names in the list', async ({ page }) => {
    await mockAdminApi(page, {
      gist: (route) => route.fulfill({
        json: {
          organizations: [{ ...ORGANIZATIONS[0], name: '<img src=x onerror="window.__xss=1">Evil' }],
          categories: CATEGORIES,
          version: 'v1',
          updatedAt: '2026-10-01T12:00:00Z',
        },
      }),
    });
    await page.goto('/admin/');
    await expect(page.locator('#org-list strong')).toHaveText('<img src=x onerror="window.__xss=1">Evil');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});
