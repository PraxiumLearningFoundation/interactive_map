#!/usr/bin/env node
// Records demo videos of the board admin and the public map with Playwright,
// then converts them to MP4 with ffmpeg.
//
//   node scripts/demo-videos/record-demos.js            # all videos
//   node scripts/demo-videos/record-demos.js map-vertical admin
//
// Videos land in demo-videos/ (gitignored). The admin demo runs against a local
// copy of the admin page with the real organization data and a fake API, so
// nothing is ever published. The map videos use the live production data.
'use strict';

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'demo-videos');
const PORT = 4199;
const BASE = `http://127.0.0.1:${PORT}`;
const GIST_URL = 'https://gist.githubusercontent.com/PraxiumLearning03/a139fdb216bcc3e91b67754c283f3805/raw/organization-network-map.json';

// ---------------------------------------------------------------------------
// On-screen captions and a visible cursor, injected into every page.
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('demo-caption')) return;
    const style = document.createElement('style');
    style.textContent = `
      #demo-caption{position:fixed;left:50%;bottom:7%;transform:translate(-50%,12px);z-index:2147483647;
        max-width:min(86vw,900px);padding:.7em 1.1em;border-radius:14px;background:rgba(32,30,29,.88);
        color:#fbf8f3;font:600 clamp(18px,2.6vw,30px)/1.3 Poppins,system-ui,sans-serif;text-align:center;
        box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .35s ease,transform .35s ease;pointer-events:none}
      #demo-caption.show{opacity:1;transform:translate(-50%,0)}
      #demo-caption small{display:block;margin-top:.2em;font-weight:400;font-size:.62em;color:#e3cdbd}
      #demo-cursor{position:fixed;left:-60px;top:-60px;z-index:2147483647;width:26px;height:26px;margin:-13px 0 0 -13px;
        border-radius:50%;background:rgba(133,98,75,.35);border:3px solid #85624b;pointer-events:none;
        transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1),transform .15s ease}
      #demo-cursor.press{transform:scale(.7)}`;
    document.head.appendChild(style);
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    document.body.append(caption, cursor);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function director(page) {
  return {
    async caption(title, sub, hold = 2600) {
      await page.evaluate(([t, s]) => {
        const el = document.getElementById('demo-caption');
        el.replaceChildren(document.createTextNode(t));
        if (s) {
          const small = document.createElement('small');
          small.textContent = s;
          el.appendChild(small);
        }
        el.classList.add('show');
      }, [title, sub || '']);
      await sleep(hold);
    },
    async hideCaption() {
      await page.evaluate(() => document.getElementById('demo-caption').classList.remove('show'));
      await sleep(400);
    },
    async pointAt(locator) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (!box) return;
      await page.evaluate(([x, y]) => {
        const c = document.getElementById('demo-cursor');
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      await sleep(800);
    },
    async click(locator, after = 900) {
      await this.pointAt(locator);
      await page.evaluate(() => document.getElementById('demo-cursor').classList.add('press'));
      await locator.click();
      await page.evaluate(() => document.getElementById('demo-cursor').classList.remove('press'));
      await sleep(after);
    },
    async type(locator, text, after = 700) {
      await this.click(locator, 200);
      await locator.pressSequentially(text, { delay: 85 });
      await sleep(after);
    },
  };
}

// ---------------------------------------------------------------------------
// Scenes

async function openMap(page) {
  await page.goto(`${BASE}/organization-network-map.html`);
  await page.evaluate(() => window.praxiumNetwork.ready);
  await sleep(2500); // tiles + fit-to-network animation
}

// Pick a well-described organization that isn't Praxium itself to feature.
function featured(orgs) {
  const candidates = orgs.filter((o) => !/praxium/i.test(o.name) && o.description);
  return candidates.sort((a, b) => (b.description || '').length - (a.description || '').length)[0] || orgs[0];
}

async function mapLandscape(page, orgs) {
  const d = director(page);
  const star = featured(orgs);
  await openMap(page);
  await d.caption('Praxium Allies & Partners', `${orgs.length} organizations learning, serving and creating change`, 3200);
  await d.hideCaption();
  await d.click(page.locator(`.org-item[data-id="${star.id}"]`), 3200);
  await d.caption(star.name, star.location, 3000);
  await d.hideCaption();
  await sleep(1200);
  await d.click(page.locator('#reset-view'), 2200);
  await d.type(page.locator('#search-input'), (star.category || '').split(' ')[0] || 'health', 1600);
  await d.caption('Search by name, place, focus area, or tag', null, 2600);
  await d.hideCaption();
  await page.locator('#search-input').fill('');
  await page.locator('#search-input').dispatchEvent('input');
  await sleep(800);
  await d.click(page.locator('#dark-mode-toggle'), 2000);
  await d.caption('Explore the network', 'praxiumfoundation.com/partner-map', 3600);
}

async function mapVertical(page, orgs) {
  const d = director(page);
  const star = featured(orgs);
  await openMap(page);
  await d.caption('Our global network', `${orgs.length} allies & partners`, 3000);
  await d.hideCaption();
  await d.click(page.locator('#sidebar-toggle'), 1500);
  await page.locator('#organization-list').evaluate((el) => el.scrollTo({ top: 260, behavior: 'smooth' }));
  await sleep(1600);
  await page.locator('#organization-list').evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(1200);
  await d.click(page.locator('#filters-button'), 1200);
  const firstOption = page.locator('#sheet-category-options .sheet-option').first();
  await d.click(firstOption, 1000);
  await d.click(page.locator('#filter-sheet-apply'), 1400);
  await d.caption('Filter by focus area', null, 2200);
  await d.hideCaption();
  await d.click(page.locator('.active-filter-chip').first(), 900);
  await d.click(page.locator(`.org-item[data-id="${star.id}"]`), 3600);
  await d.caption(star.name, star.location, 3200);
  await d.hideCaption();
  await sleep(1500);
  await d.caption('See who we work with', 'praxiumfoundation.com/partner-map', 3600);
}

async function admin(page, orgs) {
  const d = director(page);
  const backend = { organizations: structuredClone(orgs), version: 'demo-1' };
  const categories = JSON.parse(fs.readFileSync(path.join(ROOT, 'categories.json'), 'utf8'));
  await page.route('**/api/gist', (route) => route.fulfill({
    json: { organizations: backend.organizations, categories, version: backend.version, updatedAt: new Date().toISOString() },
  }));
  await page.route('**/api/publish', (route) => {
    const body = route.request().postDataJSON();
    if (body.mode === 'update') {
      backend.organizations = backend.organizations.map((o) => (o.id === body.orgId ? { ...o, ...body.org, id: o.id } : o));
    }
    backend.version = `demo-${Date.now()}`;
    return route.fulfill({ json: { ok: true, version: backend.version } });
  });
  await page.route('**/api/geocode', (route) => route.fulfill({
    json: { lat: 49.2827, lng: -123.1207, displayName: 'Vancouver, British Columbia, Canada' },
  }));

  const star = featured(orgs);
  await page.goto(`${BASE}/admin/`);
  await page.locator('#org-list .org-card').first().waitFor();
  await sleep(800);
  await d.caption('Board admin: managing the partner map', 'Sign in with your Praxium Microsoft account', 3400);
  await d.hideCaption();

  await d.caption('Every organization on the map, A–Z', null, 2400);
  await d.hideCaption();
  await d.type(page.locator('#org-search'), star.name.split(' ')[0], 1200);
  await d.caption('Search to find an organization', null, 2000);
  await d.hideCaption();
  await d.click(page.locator('.org-card', { hasText: star.name }).getByRole('button', { name: 'Edit' }), 1400);

  await d.caption('Edit details, contact info and location', 'The preview map shows exactly where the pin will go', 3200);
  await d.hideCaption();
  await page.locator('#preview-map').scrollIntoViewIfNeeded();
  await sleep(1600);

  const tagInput = page.locator('#org-tag-input');
  await tagInput.scrollIntoViewIfNeeded();
  await d.caption('Add tags so visitors can search for them', 'Press Enter after each tag', 2600);
  await d.type(tagInput, 'Community', 300);
  await tagInput.press('Enter');
  await sleep(700);
  await tagInput.pressSequentially('Education', { delay: 85 });
  await tagInput.press('Enter');
  await sleep(1200);
  await d.hideCaption();

  await page.locator('#org-relationship').scrollIntoViewIfNeeded();
  await d.caption('"How Praxium connects" tells the impact story', 'It appears on the organization\'s card on the map', 3000);
  await d.hideCaption();

  await d.click(page.locator('#save-btn'), 1800);
  await d.caption('Publish — the live map updates within minutes', null, 3000);
  await d.hideCaption();

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.locator('#org-search').fill('');
  await page.locator('#org-search').dispatchEvent('input');
  await sleep(1000);
  await d.pointAt(page.locator('#tag-overview'));
  await d.caption('"Tags in use" lists every tag — click one to filter', null, 2600);
  await d.click(page.locator('.tag-filter-btn').first(), 1800);
  await d.hideCaption();
  await d.click(page.locator('.tag-filter-btn').first(), 800);

  await d.click(page.locator('#add-org-btn'), 1200);
  await d.caption('Adding a new organization', 'Type the address, then "Look up coordinates"', 2600);
  await d.type(page.locator('#org-location'), 'Vancouver, BC', 400);
  await d.click(page.locator('#geocode-btn'), 1800);
  await d.hideCaption();
  await d.click(page.locator('#cancel-btn'), 1000);
  await d.caption('Questions? Contact the Praxium web team.', null, 3200);
}

const VIDEOS = {
  'map-landscape': { scene: mapLandscape, width: 1280, height: 720, scale: 1.5, mobile: false },
  'map-vertical': { scene: mapVertical, width: 360, height: 640, scale: 3, mobile: true },
  admin: { scene: admin, width: 1280, height: 720, scale: 1.5, mobile: false },
};

// ---------------------------------------------------------------------------

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${BASE}/organization-network-map.html`);
      if (res.ok) return;
    } catch (error) { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('static server did not start');
}

// Playwright's recordVideo captures CSS pixels only, so a phone-sized viewport
// would give a 360x640 video. Chrome's screencast captures device pixels, so we
// record its frames (with timestamps) and let ffmpeg stitch them together.
async function record(name, config, orgs, browser) {
  const frameDir = path.join(OUT, 'raw', name);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  const outW = Math.round(config.width * config.scale);
  const outH = Math.round(config.height * config.scale);
  const context = await browser.newContext({
    viewport: { width: config.width, height: config.height },
    deviceScaleFactor: config.scale,
    isMobile: config.mobile,
    hasTouch: config.mobile,
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(frameDir, `${String(frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: outW, maxHeight: outH, everyNthFrame: 1 });
  try {
    await config.scene(page, orgs);
    await sleep(800);
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => {});
    await context.close();
  }
  if (frames.length < 2) throw new Error(`no frames captured for ${name}`);

  // Chrome only sends a frame when the screen changes: hold each frame until the next.
  const lines = ['ffconcat version 1.0'];
  frames.forEach((frame, i) => {
    const next = frames[i + 1];
    const duration = next ? Math.max(next.t - frame.t, 1 / 60) : 1;
    lines.push(`file '${frame.file}'`, `duration ${duration.toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  const list = path.join(frameDir, 'frames.ffconcat');
  fs.writeFileSync(list, lines.join('\n'));

  const mp4 = path.join(OUT, `praxium-${name}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=white,fps=30`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4,
  ]);
  fs.rmSync(frameDir, { recursive: true, force: true });
  return mp4;
}

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length ? wanted : Object.keys(VIDEOS);
  const unknown = names.filter((n) => !VIDEOS[n]);
  if (unknown.length) throw new Error(`unknown video(s): ${unknown.join(', ')} — choose from ${Object.keys(VIDEOS).join(', ')}`);

  fs.mkdirSync(OUT, { recursive: true });
  const orgs = await (await fetch(GIST_URL)).json();
  const server = spawn(process.execPath, [path.join(ROOT, 'e2e', 'static-server.js'), String(PORT)], { stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    await waitForServer();
    for (const name of names) {
      const file = await record(name, VIDEOS[name], orgs, browser);
      console.log(`✓ ${path.relative(ROOT, file)}`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
