// Playwright mobile verification — ADERVIS OTR mobile layer
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── TEST AT 375px (iPhone SE) ──────────────────────────────
  const ctx375 = await browser.newContext({
    viewport: { width: 375, height: 667 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page375 = await ctx375.newPage();

  // Capture console errors
  const consoleErrors = [];
  page375.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page375.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

  await page375.goto('http://127.0.0.1:7843/index.html', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page375.waitForTimeout(1500); // let JS settle

  // 1. Screenshot — auth screen at 375px
  await page375.screenshot({ path: 'verify-auth-375.png', fullPage: false });
  console.log('✅ 1. Auth screen screenshot saved → verify-auth-375.png');

  // 2. Auth card width — should be ≈ calc(100vw - 32px) = 343px
  const authCard = await page375.$('.auth-card');
  if (authCard) {
    const box = await authCard.boundingBox();
    const w = Math.round(box.width);
    const ok = w >= 300 && w <= 360;
    console.log(`${ok ? '✅' : '❌'} 2. Auth card width on 375px: ${w}px (expect 300–360)`);
  } else {
    console.log('⚠️  2. .auth-card not found (auth might auto-restore from session)');
  }

  // 3. #mobileTabBar exists and is in DOM
  const tabBar = await page375.$('#mobileTabBar');
  console.log(`${tabBar ? '✅' : '❌'} 3. #mobileTabBar exists in DOM`);

  // 4. Tab bar computed display — should NOT be 'none' at 375px
  if (tabBar) {
    const display = await page375.evaluate(() => {
      const el = document.getElementById('mobileTabBar');
      return window.getComputedStyle(el).display;
    });
    const ok = display !== 'none';
    console.log(`${ok ? '✅' : '❌'} 4. #mobileTabBar computed display: "${display}" (expect flex, not none)`);
  }

  // 5. .header computed display — should be 'none' at 375px
  const headerDisplay = await page375.evaluate(() => {
    const el = document.querySelector('.header');
    if (!el) return 'ELEMENT_MISSING';
    return window.getComputedStyle(el).display;
  });
  const headerHidden = headerDisplay === 'none';
  console.log(`${headerHidden ? '✅' : '❌'} 5. .header display on 375px: "${headerDisplay}" (expect none)`);

  // 6. JS functions defined
  const fns = ['isMobile','switchMobileTab','setMobileView','openMobileChat',
                'closeMobileChat','setupMobileKeyboard','openMobileMoreSheet','closeMobileMoreSheet'];
  for (const fn of fns) {
    const defined = await page375.evaluate(name => typeof window[name] === 'function', fn);
    console.log(`${defined ? '✅' : '❌'} 6. window.${fn} defined`);
  }

  // 7. #mobileMoreSheet is a <dialog> element
  const sheetTag = await page375.evaluate(() => {
    const el = document.getElementById('mobileMoreSheet');
    return el ? el.tagName.toLowerCase() : null;
  });
  console.log(`${sheetTag === 'dialog' ? '✅' : '❌'} 7. #mobileMoreSheet tag: "${sheetTag}" (expect dialog)`);

  // 8. #mobileChatBack exists
  const backBtn = await page375.$('#mobileChatBack');
  console.log(`${backBtn ? '✅' : '❌'} 8. #mobileChatBack button exists`);

  // 9. Console errors during load
  console.log(`${consoleErrors.length === 0 ? '✅' : '⚠️ '} 9. Console errors on load: ${consoleErrors.length}`);
  if (consoleErrors.length) consoleErrors.slice(0, 5).forEach(e => console.log('   → ' + e));

  // ── PROBE: Desktop at 1280px — tab bar must be hidden ──────
  const ctx1280 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page1280 = await ctx1280.newPage();
  await page1280.goto('http://127.0.0.1:7843/index.html', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page1280.waitForTimeout(800);

  // 🔍 Tab bar hidden on desktop
  const tabBarDesktop = await page1280.evaluate(() => {
    const el = document.getElementById('mobileTabBar');
    if (!el) return 'MISSING';
    return window.getComputedStyle(el).display;
  });
  const desktopOk = tabBarDesktop === 'none';
  console.log(`${desktopOk ? '🔍' : '❌'} PROBE. #mobileTabBar on 1280px: "${tabBarDesktop}" (expect none)`);

  // 🔍 .header visible on desktop
  const headerDesktop = await page1280.evaluate(() => {
    const el = document.querySelector('.header');
    if (!el) return 'MISSING';
    return window.getComputedStyle(el).display;
  });
  const headerDesktopOk = headerDesktop !== 'none';
  console.log(`${headerDesktopOk ? '🔍' : '❌'} PROBE. .header on 1280px: "${headerDesktop}" (expect visible)`);

  await page1280.screenshot({ path: 'verify-desktop-1280.png', fullPage: false });
  console.log('🔍 PROBE. Desktop 1280px screenshot → verify-desktop-1280.png');

  // ── PROBE: Boundary at 768px ───────────────────────────────
  const ctx768 = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const page768 = await ctx768.newPage();
  await page768.goto('http://127.0.0.1:7843/index.html', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page768.waitForTimeout(500);
  const tabBar768 = await page768.evaluate(() => {
    const el = document.getElementById('mobileTabBar');
    if (!el) return 'MISSING';
    return window.getComputedStyle(el).display;
  });
  console.log(`🔍 PROBE. #mobileTabBar at 768px: "${tabBar768}" (mobile boundary)`);

  await browser.close();
  console.log('\nDone.');
})().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
