const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:5173');
    await page.locator('[data-book="tanjing"]').click();
    await page.waitForFunction(() => document.querySelector('.para[data-para]'));
    const selectText = async () => {
      await page.evaluate(() => {
        const p = document.querySelector('.para[data-para]');
        p.scrollIntoView();
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let n; while ((n = walker.nextNode())) if (n.textContent.trim().length >= 3 && !n.parentElement.closest('rt')) break;
        const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(3, n.length));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      });
      await page.locator('#selection-toolbar').waitFor({ state: 'visible' });
    };
    await selectText();
    assert.equal(await page.locator('#selection-toolbar button').count(), 8);
    await page.locator('[data-selection-action="lookup"]').waitFor({ state: 'visible' });
    await page.locator('[data-selection-action="sentence"]').waitFor({ state: 'visible' });
    for (const action of ['lookup', 'sentence']) {
      await selectText();
      await page.locator(`[data-selection-action="${action}"]`).click();
      await page.locator('#lookup-panel').waitFor({ state: 'visible' });
      assert.ok((await page.locator('#lookup-content').textContent()).trim());
      await page.locator('#lookup-back').click();
      await page.locator('#lookup-panel').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#panel-overlay').isVisible(), false);
      assert.equal(await page.evaluate(() => document.body.classList.contains('reader-panel-open')), false);
    }
    await page.locator('#mobile-quote-btn').click();
    await page.locator('#quote-card').waitFor({ state: 'visible' });
    await page.locator('#mobile-notes-btn').click();
    await page.locator('#quote-card').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#panel-overlay').isVisible(), true);
    await page.locator('#panel-overlay').click({ position: { x: 2, y: 2 } });
    await selectText();
    await page.locator('[data-selection-action="highlight"]').click();
    assert.ok(await page.locator('mark.reader-note-highlight').count());
    assert.equal(await page.evaluate(() => document.body.classList.contains('reader-selection-locked')), false);
    await selectText();
    await page.locator('[data-selection-action="note"]').click();
    await page.locator('#notes-thought').fill('回归测试笔记');
    await page.locator('#notes-save').click();
    await page.getByText('回归测试笔记', { exact: true }).waitFor();
    page.once('dialog', d => d.dismiss());
    await page.locator('.note-delete').click();
    assert.equal(await page.locator('.note-card').count(), 1);
    page.once('dialog', d => d.accept());
    await page.locator('.note-delete').click();
    assert.equal(await page.locator('.note-card').count(), 0);
    await page.locator('#panel-overlay').click({ position: { x: 2, y: 2 } });
    await selectText();
    await page.locator('[data-selection-action="copy"]').click();
    await page.getByText('已复制经文', { exact: true }).waitFor();
    // 明确模拟不支持 Web Share 的浏览器，验证可用的降级路径。
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }));
    await selectText();
    await page.locator('[data-selection-action="share"]').click();
    await page.getByText('书摘已复制，可粘贴分享', { exact: true }).waitFor();
    await selectText();
    await page.locator('[data-selection-action="ask"]').click();
    await page.locator('#lighthouse-copy').click();
    await page.locator('#lighthouse-status').filter({ hasText: '提问已复制' }).waitFor();
    assert.equal(await page.locator('.lighthouse-handoff a').getAttribute('href'), 'https://onemooring.xyz/');
    assert.equal(await page.locator('.lighthouse-handoff a').getAttribute('target'), '_blank');
    await page.locator('#panel-overlay').click({ position: { x: 2, y: 2 } });
    await selectText();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#selection-toolbar').isVisible(), false);
    assert.equal(await page.evaluate(() => document.body.classList.contains('reader-selection-locked')), false);
    assert.deepEqual(errors, []);
    console.log('PASS: eight selection actions, lookup/sentence return, quote-to-notes overlay, highlight, unlock, notes, delete cancel/confirm, copy, share fallback, lighthouse handoff, Escape, no runtime errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
