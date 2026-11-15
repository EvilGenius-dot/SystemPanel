import { expect, test, type Page } from '@playwright/test';

async function desktopStartup(page: Page, readFails = false) {
  await page.addInitScript(({ readFails }) => {
    const startup = {
      readFails, writeFails: false, partialWrite: false, hold: false,
      release: () => {}, writes: [] as boolean[],
    };
    Object.assign(window, {
      isTauri: true, startup,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: { enabled?: boolean }) => {
          if (command === 'get_panel_state') return { snapshot: null, pinned: false, interval: 2, error: null };
          if (command === 'get_autostart') {
            if (startup.readFails) throw new Error('Read denied');
            return localStorage.getItem('test.system-startup') === 'true';
          }
          if (command === 'set_autostart') {
            startup.writes.push(!!args?.enabled);
            if (startup.hold) await new Promise<void>(resolve => { startup.release = resolve; });
            if (!startup.writeFails || startup.partialWrite) localStorage.setItem('test.system-startup', String(args?.enabled));
            if (startup.writeFails) throw new Error('Write failed');
            return args?.enabled;
          }
        },
      },
    });
  }, { readFails });
}

test('browser preview cannot register a startup item', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '跟随系统启动' })).toBeDisabled();
  await expect(page.getByText('仅桌面版', { exact: true })).toBeVisible();
});

test('startup waits for OS confirmation and reads the saved state after reload', async ({ page }) => {
  await desktopStartup(page);
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '跟随系统启动' });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() => { (window as unknown as { startup: { hold: boolean } }).startup.hold = true; });
  await toggle.click();
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await page.evaluate(() => { (window as unknown as { startup: { release: () => void } }).startup.release(); });
  await expect(toggle).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => (window as unknown as { startup: { writes: boolean[] } }).startup.writes)).toEqual([false]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('systempanel.preferences') ?? '{}'))).not.toHaveProperty('autostart');
});

test('read failure is recoverable and a failed write never pretends to succeed', async ({ page }) => {
  await desktopStartup(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '跟随系统启动' });
  await expect(page.getByRole('alert')).toContainText('无法读取启动设置');
  await expect(toggle).toBeDisabled();
  await page.evaluate(() => { Object.assign((window as unknown as { startup: object }).startup, { readFails: false, writeFails: true }); });
  await page.getByRole('button', { name: '重新读取' }).click();
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.getByRole('alert')).toContainText('无法更改启动设置');
  await expect(toggle).not.toBeChecked();
  // If the OS write did succeed before an error, display the read-back state.
  await page.evaluate(() => { Object.assign((window as unknown as { startup: object }).startup, { partialWrite: true }); });
  await toggle.click();
  await expect(page.getByRole('alert')).toContainText('无法更改启动设置');
  await expect(toggle).toBeChecked();
});

test('reopening settings reflects an externally changed startup registration', async ({ page }) => {
  await desktopStartup(page);
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '跟随系统启动' });
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.evaluate(() => localStorage.setItem('test.system-startup', 'true'));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(toggle).toBeChecked();
});
