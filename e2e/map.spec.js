const { test, expect } = require('@playwright/test');
const { ORGANIZATIONS, GIST_URL, mockMapData } = require('./fixtures');

const MAP_PATH = '/organization-network-map.html';

async function openMap(page, options) {
  await mockMapData(page, options);
  await page.goto(MAP_PATH);
  await page.evaluate(() => window.praxiumNetwork.ready);
  // `ready` fires before the map's delayed fit-to-all-markers, which moves every
  // marker; wait until markers stop moving so clicks don't land where one used to be.
  await waitForMarkersToSettle(page);
}

async function waitForMarkersToSettle(page) {
  let previous = null;
  await expect.poll(async () => {
    const current = await page.evaluate(() => JSON.stringify(
      [...document.querySelectorAll('.leaflet-marker-icon')].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top];
      }),
    ));
    const settled = current === previous;
    previous = current;
    return settled;
  }, { intervals: [150] }).toBe(true);
}

function offScreenMarkers(page) {
  return page.evaluate(() => {
    const bounds = document.getElementById('map').getBoundingClientRect();
    return [...document.querySelectorAll('.leaflet-marker-icon')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < bounds.left || r.right > bounds.right || r.top < bounds.top || r.bottom > bounds.bottom;
      })
      .map((el) => el.title);
  });
}

async function openSidebarIfMobile(page, isMobile) {
  if (isMobile) await page.locator('#sidebar-toggle').click();
}

test.describe('public network map', () => {
  test('loads organizations, stats, markers and legend', async ({ page }) => {
    await openMap(page);

    await expect(page.locator('#map-loading')).toBeHidden();
    await expect(page.locator('#result-count')).toHaveText('3 of 3');
    await expect(page.locator('#stat-organizations')).toHaveText('3');
    await expect(page.locator('#stat-categories')).toHaveText('3');
    await expect(page.locator('#stat-places')).toHaveText('2');
    await expect(page.locator('#stat-places-label')).toHaveText('Countries');
    await expect(page.locator('#stat-connections-card')).not.toHaveAttribute('hidden');
    await expect(page.locator('#stat-connections')).toHaveText('1');

    await expect(page.locator('.leaflet-marker-icon.custom-marker')).toHaveCount(3);
    await expect(page.locator('.org-item')).toHaveCount(3);
    await expect(page.locator('#legend-items .legend-item')).toHaveCount(3);
    await expect(page.locator('#category-filter option')).toHaveText([
      /All/i, 'Arts (1)', 'Health (1)', 'Not-For-Profit (1)',
    ]);
  });

  test('search filters the list and markers, and can be cleared', async ({ page, isMobile }) => {
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);

    await page.locator('#search-input').fill('kenya');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');
    await expect(page.locator('.org-item:visible')).toHaveText(/Highland Health Network/);
    await expect(page.locator('.leaflet-marker-icon.custom-marker')).toHaveCount(1);
    await expect(page.locator('#clear-search')).toBeVisible();

    await page.locator('#search-input').fill('no such organization');
    await expect(page.locator('#empty-results')).toBeVisible();

    await page.locator('#clear-search').click();
    await expect(page.locator('#result-count')).toHaveText('3 of 3');
    await expect(page.locator('#empty-results')).toBeHidden();
  });

  test('Escape clears the search box', async ({ page, isMobile }) => {
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);

    await page.locator('#search-input').fill('arts');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');
    await page.locator('#search-input').press('Escape');
    await expect(page.locator('#search-input')).toHaveValue('');
    await expect(page.locator('#result-count')).toHaveText('3 of 3');
  });

  test('category filter and "Clear filters"', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones use the filter sheet (see "phone filter sheet" tests).');
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);

    await page.locator('#category-filter').selectOption('Health');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');
    await expect(page.locator('#clear-filters')).toBeVisible();

    await page.locator('#clear-filters').click();
    await expect(page.locator('#category-filter')).toHaveValue('all');
    await expect(page.locator('#result-count')).toHaveText('3 of 3');
    await expect(page.locator('#clear-filters')).toBeHidden();
  });

  test('legend item toggles its category filter', async ({ page, isMobile }) => {
    await openMap(page);
    if (isMobile) await page.locator('#legend-toggle').click();

    const arts = page.locator('#legend-items .legend-item[data-category="Arts"]');
    await arts.click();
    await expect(page.locator('#category-filter')).toHaveValue('Arts');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');

    if (isMobile) {
      // Picking a category closes the legend on phones; reopen it to toggle off.
      await expect(page.locator('#legend')).not.toHaveClass(/legend-open/);
      await page.locator('#legend-toggle').click();
    }
    await expect(arts).toHaveAttribute('aria-pressed', 'true');
    await arts.click();
    await expect(page.locator('#category-filter')).toHaveValue('all');
  });

  test('selecting an organization card opens its popup', async ({ page, isMobile }) => {
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);

    await page.locator('.org-item', { hasText: 'Praxium Learning Foundation' }).click();
    if (isMobile) await expect(page.locator('#sidebar')).not.toHaveClass(/sidebar-open/);

    const popup = page.locator('.leaflet-popup .popup-content');
    await expect(popup.locator('.popup-title')).toHaveText('Praxium Learning Foundation');
    await expect(popup.locator('.popup-location')).toHaveText('Vancouver, British Columbia, Canada');
    await expect(popup.locator('.popup-relationship')).toContainText('Our home organization.');
    await expect(popup.locator('.popup-connections')).toContainText('1 mapped connection: Riverbank Arts Collective');
    await expect(popup.getByRole('link', { name: /Visit Praxium Learning Foundation website/ }))
      .toHaveAttribute('href', 'https://www.praxiumfoundation.com/');
    await expect(popup.getByRole('link', { name: 'Email Praxium Learning Foundation' }))
      .toHaveAttribute('href', 'mailto:info@example.org');
    await expect(popup.getByRole('link', { name: 'Call Praxium Learning Foundation' }))
      .toHaveAttribute('href', 'tel:+16045550100');

    await page.keyboard.press('Escape');
    await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  });

  test('clicking a marker opens its popup', async ({ page }) => {
    await openMap(page);
    await page.locator('.leaflet-marker-icon[title="Highland Health Network"]').click();
    await expect(page.locator('.leaflet-popup .popup-title')).toHaveText('Highland Health Network');
  });

  test('theme toggle switches to dark mode and is remembered', async ({ page }) => {
    await openMap(page);
    const toggle = page.locator('#dark-mode-toggle');

    await toggle.click();
    await expect(page.locator('body')).toHaveClass(/dark/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.locator('.theme-label')).toHaveText('Light');

    await page.reload();
    await page.evaluate(() => window.praxiumNetwork.ready);
    await expect(page.locator('body')).toHaveClass(/dark/);
  });

  test('falls back to cached data when the live source fails', async ({ page }) => {
    await openMap(page);

    await page.unroute(GIST_URL);
    await page.route(GIST_URL, (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.reload();
    await page.evaluate(() => window.praxiumNetwork.ready);

    await expect(page.locator('#data-status-banner')).toBeVisible();
    await expect(page.locator('#data-status-message')).toContainText('Live updates are temporarily unavailable');
    await expect(page.locator('#result-count')).toHaveText('3 of 3');

    await page.locator('#data-status-dismiss').click();
    await expect(page.locator('#data-status-banner')).toBeHidden();
  });

  test('shows an error when the data source fails with no cache', async ({ page }) => {
    await openMap(page, { status: 500 });
    await expect(page.locator('#data-status-message')).toHaveText(
      'The organization network could not be loaded. Please try again later.',
    );
    await expect(page.locator('.org-item')).toHaveCount(0);
  });

  test('skips invalid records and reports a warning', async ({ page }) => {
    await openMap(page, { organizations: [...ORGANIZATIONS, { id: 99, name: 'Broken' }] });
    await expect(page.locator('#result-count')).toHaveText('3 of 3');
    await expect(page.locator('#data-status-message')).toContainText('safely ignored');
  });

  test('renders untrusted text as text, not HTML', async ({ page }) => {
    const hostile = { ...ORGANIZATIONS[2], name: '<img src=x onerror="window.__xss=1">Evil' };
    await openMap(page, { organizations: [ORGANIZATIONS[0], hostile] });
    await expect(page.locator('.org-item', { hasText: '<img src=x' })).toHaveCount(1);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('shows a single "open full map" button when embedded', async ({ page, isMobile }) => {
    await mockMapData(page);
    // Host the iframe on a same-origin page so the map sees itself as embedded.
    await page.route('**/embed-host.html', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<meta name="viewport" content="width=device-width, initial-scale=1">
        <iframe src="${MAP_PATH}" style="width:100%;height:700px;border:0"></iframe>`,
    }));
    await page.goto('/embed-host.html');
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#result-count')).toHaveText('3 of 3');

    const openLink = frame.locator('#open-map-link');
    if (isMobile) {
      // On phones the expand FAB doubles as the open-full-map control.
      await expect(openLink).toBeHidden();
    } else {
      await expect(openLink).toBeVisible();
      await expect(openLink).toHaveAttribute('href', new RegExp(`${MAP_PATH}$`));
    }
  });
});

test.describe('public network map — phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only controls');

  test('sidebar opens and closes from the menu button and overlay', async ({ page }) => {
    await openMap(page);
    const toggle = page.locator('#sidebar-toggle');

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(page.locator('#sidebar')).toHaveClass(/sidebar-open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // The drawer covers the left ~85% of the screen; tap the exposed strip on the right.
    const { width, height } = page.viewportSize();
    await page.mouse.click(width - 8, height / 2);
    await expect(page.locator('#sidebar')).not.toHaveClass(/sidebar-open/);
  });

  test('"show all" view fits a cross-continent network on screen', async ({ page }) => {
    // Vancouver to Nairobi is too wide for a phone at zoom 2.
    await openMap(page);
    expect(await offScreenMarkers(page)).toEqual([]);
  });

  test('"View all" button zooms back out after selecting an organization', async ({ page }) => {
    await openMap(page);
    const viewAll = page.getByRole('button', { name: 'View all organizations' });
    await expect(viewAll).toBeVisible();

    await page.locator('.leaflet-marker-icon[title="Highland Health Network"]').click();
    await expect(page.locator('.leaflet-popup')).toHaveCount(1);

    await viewAll.click();
    await expect(page.locator('.leaflet-popup')).toHaveCount(0);
    await waitForMarkersToSettle(page);
    expect(await offScreenMarkers(page)).toEqual([]);
  });

  test('legend opens and closes', async ({ page }) => {
    await openMap(page);
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend')).toHaveClass(/legend-open/);
    await page.locator('#legend-close').click();
    await expect(page.locator('#legend')).not.toHaveClass(/legend-open/);
  });
});

test.describe('public map tags', () => {
  test('tag filter lists tags with merged counts and narrows the map', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones use the filter sheet (see "phone filter sheet" tests).');
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);

    await expect(page.locator('#tag-filter-field')).toBeVisible();
    await expect(page.locator('#tag-filter option')).toHaveText(['All tags', 'Youth (2)', 'Literacy (1)', 'Murals (1)']);

    await page.locator('#tag-filter').selectOption('youth');
    await expect(page.locator('#result-count')).toHaveText('2 of 3');
    await expect(page.locator('.leaflet-marker-icon.custom-marker')).toHaveCount(2);
    await expect(page.locator('#clear-filters')).toBeVisible();

    await page.locator('#tag-filter').selectOption('murals');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');
    await expect(page.locator('.org-item:visible .org-name')).toHaveText('Riverbank Arts Collective');

    await page.locator('#clear-filters').click();
    await expect(page.locator('#tag-filter')).toHaveValue('');
    await expect(page.locator('#result-count')).toHaveText('3 of 3');
  });

  test('search matches tags', async ({ page, isMobile }) => {
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);
    await page.locator('#search-input').fill('litera');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');
    await expect(page.locator('.org-item:visible .org-name')).toHaveText('Praxium Learning Foundation');
  });

  test('cards and popups show tags; a popup tag applies the filter', async ({ page, isMobile }) => {
    await openMap(page);
    await openSidebarIfMobile(page, isMobile);
    const card = page.locator('.org-item[data-id="1"]');
    await expect(card.locator('.org-tags')).toHaveText('#Youth #Literacy');
    await card.click();

    const popup = page.locator('.leaflet-popup-content');
    await expect(popup.locator('.popup-tag')).toHaveText(['#Youth', '#Literacy']);
    await popup.getByRole('button', { name: 'Show organizations tagged Literacy' }).click();
    await expect(page.locator('#tag-filter')).toHaveValue('literacy');
    await expect(page.locator('#result-count')).toHaveText('1 of 3');
  });

  test('tag filter stays hidden when no organization has tags', async ({ page }) => {
    const untagged = ORGANIZATIONS.map(({ tags, ...rest }) => rest);
    await openMap(page, { organizations: untagged });
    await expect(page.locator('#tag-filter-field')).toBeHidden();
  });

  test('tags from the Gist render as text, not HTML', async ({ page, isMobile }) => {
    const hostile = structuredClone(ORGANIZATIONS);
    hostile[2].tags = ['<img src=x onerror="window.__pwned=1">'];
    await openMap(page, { organizations: hostile });
    await openSidebarIfMobile(page, isMobile);
    await expect(page.locator('.org-item[data-id="3"] .org-tags')).toContainText('<img');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });
});


test('a tag literally named "All" still filters', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones use the filter sheet (see "phone filter sheet" tests).');
  const rows = structuredClone(ORGANIZATIONS);
  rows[2].tags = ['All'];
  await openMap(page, { organizations: rows });
  await openSidebarIfMobile(page, isMobile);
  await page.locator('#tag-filter').selectOption({ label: 'All (1)' });
  await expect(page.locator('#result-count')).toHaveText('1 of 3');
});

test.describe('phone filter sheet', () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, 'phone-only UI'));

  async function openDrawer(page) {
    await openMap(page);
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('#sidebar')).toHaveClass(/sidebar-open/);
  }

  test('drawer shows brand header, one-row stats, search + Filters; selects are hidden', async ({ page }) => {
    await openDrawer(page);
    await expect(page.locator('#sidebar .network-hero h1')).toBeVisible();
    await expect(page.locator('#sidebar .brand-lockup')).toBeVisible();
    await expect(page.locator('#filters-button')).toBeVisible();
    await expect(page.locator('#category-filter')).toBeHidden();
    await expect(page.locator('#tag-filter-field')).toBeHidden();
    await expect(page.locator('#mobile-result-count')).toHaveText('Showing 3 of 3');
    await expect(page.locator('#filters-badge')).toBeHidden();
    const box = await page.locator('#filters-button').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('sheet drafts filters, previews the count, and applies on Show', async ({ page }) => {
    await openDrawer(page);
    await page.locator('#filters-button').click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await expect(page.locator('#filter-sheet-apply')).toHaveText('Show all 3');

    await sheet.getByRole('button', { name: '#Youth' }).click();
    await expect(sheet.getByRole('button', { name: '#Youth' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#filter-sheet-apply')).toHaveText('Show 2 organizations');
    await sheet.getByRole('button', { name: 'Arts', exact: true }).click();
    await expect(page.locator('#filter-sheet-apply')).toHaveText('Show 1 organization');
    // Nothing applied until Show
    await expect(page.locator('#mobile-result-count')).toHaveText('Showing 3 of 3');

    await page.locator('#filter-sheet-apply').click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('#filters-button')).toBeFocused();
    await expect(page.locator('#mobile-result-count')).toHaveText('Showing 1 of 3');
    await expect(page.locator('#filters-badge')).toHaveText('2');
    await expect(page.locator('.active-filter-chip')).toHaveText(['Arts×', '#Youth×']);
    await expect(page.locator('#category-filter')).toHaveValue('Arts');
    await expect(page.locator('#tag-filter')).toHaveValue('youth');
  });

  test('chips remove a single filter', async ({ page }) => {
    await openDrawer(page);
    await page.locator('#filters-button').click();
    await page.getByRole('dialog').getByRole('button', { name: '#Youth' }).click();
    await page.locator('#filter-sheet-apply').click();
    await expect(page.locator('#mobile-result-count')).toHaveText('Showing 2 of 3');
    await page.getByRole('button', { name: 'Remove filter #Youth' }).click();
    await expect(page.locator('#mobile-result-count')).toHaveText('Showing 3 of 3');
    await expect(page.locator('.active-filter-chip')).toHaveCount(0);
    await expect(page.locator('#filters-badge')).toBeHidden();
  });

  test('Escape, scrim and close discard the draft; Clear resets it', async ({ page }) => {
    await openDrawer(page);
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await page.locator('#filters-button').click();
    await sheet.getByRole('button', { name: 'Health', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('#mobile-result-count')).toHaveText('Showing 3 of 3');

    await page.locator('#filters-button').click();
    await expect(sheet.getByRole('button', { name: 'Health', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await sheet.getByRole('button', { name: 'Health', exact: true }).click();
    await page.locator('#filter-sheet-clear').click();
    await expect(page.locator('#filter-sheet-apply')).toHaveText('Show all 3');
    await page.getByRole('button', { name: 'Close filters' }).click();
    await expect(sheet).toBeHidden();
  });

  test('search combines with sheet filters in the preview count', async ({ page }) => {
    await openDrawer(page);
    await page.locator('#search-input').fill('canada');
    await page.locator('#filters-button').click();
    await page.getByRole('dialog').getByRole('button', { name: '#Youth' }).click();
    await expect(page.locator('#filter-sheet-apply')).toHaveText('Show 2 organizations');
    await page.getByRole('dialog').getByRole('button', { name: 'Health', exact: true }).click();
    await expect(page.locator('#filter-sheet-apply')).toHaveText('Show 0 organizations');
    await expect(page.locator('#filter-sheet-apply')).toBeDisabled();
  });

  test('brand header collapses when the list scrolls and expands at the top', async ({ page }) => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...ORGANIZATIONS[i % 3], id: i + 1, name: `Org ${i + 1}`, connections: [],
      coordinates: [10 + i, 20 + i],
    }));
    await openMap(page, { organizations: many });
    await page.locator('#sidebar-toggle').click();
    await page.locator('#organization-list').evaluate((el) => { el.scrollTop = 200; });
    await expect(page.locator('#sidebar')).toHaveClass(/hero-collapsed/);
    await expect(page.locator('#sidebar .brand-lockup')).toHaveCSS('opacity', '0');
    await page.locator('#organization-list').evaluate((el) => { el.scrollTop = 0; });
    await expect(page.locator('#sidebar')).not.toHaveClass(/hero-collapsed/);
  });

  test('closing the drawer closes an open sheet', async ({ page }) => {
    await openDrawer(page);
    await page.locator('#filters-button').click();
    await page.locator('#sidebar-toggle').click();
    await expect(page.locator('#filter-sheet-layer')).toBeHidden();
  });
});

