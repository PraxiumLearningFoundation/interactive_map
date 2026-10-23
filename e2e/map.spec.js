const { test, expect } = require('@playwright/test');
const { ORGANIZATIONS, GIST_URL, mockMapData } = require('./fixtures');

const MAP_PATH = '/organization-network-map.html';

async function openMap(page, options) {
  await mockMapData(page, options);
  await page.goto(MAP_PATH);
  await page.evaluate(() => window.praxiumNetwork.ready);
  // `ready` fires before the map's delayed fit-to-all-markers, which moves every
  // marker; wait until markers stop moving so clicks don't land where one used to be.
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

  test('legend opens and closes', async ({ page }) => {
    await openMap(page);
    await page.locator('#legend-toggle').click();
    await expect(page.locator('#legend')).toHaveClass(/legend-open/);
    await page.locator('#legend-close').click();
    await expect(page.locator('#legend')).not.toHaveClass(/legend-open/);
  });
});
