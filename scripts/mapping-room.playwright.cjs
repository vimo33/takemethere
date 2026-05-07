const path = require('node:path');
const { _electron: electron } = require('playwright');

const cwd = path.join(__dirname, '..');

async function waitForText(page, text, timeout = 8000) {
  await page.waitForFunction((value) => document.body.textContent.includes(value), text, { timeout });
}

(async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd,
    env: {
      ...process.env,
      LOCALAPPDATA: path.join(cwd, '.local-appdata')
    }
  });

  try {
    const operator = await app.firstWindow();
    await operator.waitForLoadState('domcontentloaded');
    await waitForText(operator, 'Generation Pipeline');

    await operator.locator('[data-surface="mapping-room"]').click();
    await waitForText(operator, 'MAPPING ROOM');
    await operator.locator('[data-mapping-room]').waitFor({ timeout: 10000 });

    const initialRows = await operator.locator('.mapping-row[data-action="select-mapping"]').count();
    await operator.locator('[data-action="add-mapping-item"][data-shape="box"]').click();
    await operator.waitForFunction((count) => document.querySelectorAll('.mapping-row[data-action="select-mapping"]').length > count, initialRows);
    const afterBoxRows = await operator.locator('.mapping-row[data-action="select-mapping"]').count();

    await operator.locator('[data-action="add-mapping-item"][data-shape="frame"]').click();
    await operator.waitForFunction((count) => document.querySelectorAll('.mapping-row[data-action="select-mapping"]').length > count, afterBoxRows);
    await waitForText(operator, 'Door Frame');

    const xSlider = operator.locator('[data-slider-kind="mapping"][data-key="x"]').first();
    await xSlider.evaluate((input) => {
      input.value = '42';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await operator.waitForFunction(() => {
      const input = document.querySelector('[data-slider-kind="mapping"][data-key="x"]');
      return input && Math.abs(Number(input.value) - 42) < 0.01;
    });

    await operator.locator('[data-surface="live"]').click();
    await waitForText(operator, 'Generation Pipeline');
    const beforeFallback = await operator.evaluate(() => window.takeMeThere.getSession());
    await operator.locator('[data-action="fallback"]').click();
    await operator.waitForFunction((revision) => window.takeMeThere.getSession().then((session) => Number(session.outputRevision || 0) > Number(revision || 0)), beforeFallback.outputRevision || 0);
    const beforeArrival = await operator.evaluate(() => window.takeMeThere.getSession());
    await operator.locator('[data-action="arrival"]').click();
    await operator.waitForFunction((revision) => window.takeMeThere.getSession().then((session) => session.state?.key === 'ARRIVAL' && Number(session.outputRevision || 0) > Number(revision || 0)), beforeArrival.outputRevision || 0);

    console.log(JSON.stringify({
      ok: true,
      mappingRows: await operator.locator('.mapping-row[data-action="select-mapping"]').count(),
      outputRevisionBeforeFallback: beforeFallback.outputRevision || 0,
      outputRevisionBeforeArrival: beforeArrival.outputRevision || 0,
      state: (await operator.evaluate(() => window.takeMeThere.getSession())).state?.key
    }, null, 2));
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
