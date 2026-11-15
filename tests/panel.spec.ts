import { expect, test } from '@playwright/test';

test('preview is clearly labeled, settings persist, keyboard dismisses settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('浏览器预览 · 以下为示例数据')).toBeVisible();
  await expect(page.getByRole('meter', { name: '内存使用率' })).toHaveAttribute('aria-valuenow', '57');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.getByRole('button', { name: '5 秒', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('每 5 秒刷新')).toBeVisible();
  await page.getByRole('button', { name: '固定面板', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消固定面板' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'validation/panel-dark.png', fullPage: true });
});

test('light theme fits the narrow panel without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await page.getByRole('button', { name: '关闭设置' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await expect(page.getByText('仅在本机处理')).toBeVisible();
  await page.screenshot({ path: 'validation/panel-light-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 440, height: 820 });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByText('Macintosh HD')).toBeVisible();
  await page.screenshot({ path: 'validation/panel-light.png', fullPage: true });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.screenshot({ path: 'validation/settings-light.png', fullPage: true });
});

test('theme selection reaches the native window and System follows OS appearance', async ({ page }) => {
  await page.addInitScript(() => {
    const appearanceRequests: string[] = [];
    Object.assign(window, {
      isTauri: true,
      appearanceRequests,
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args?: { theme?: string }) => {
          if (command === 'set_appearance') appearanceRequests.push(args?.theme ?? '');
          if (command === 'get_panel_state') return { snapshot: null, pinned: false, interval: 2, error: null };
          if (command === 'get_autostart') return false;
        },
      },
    });
  });
  const lastNativeTheme = () => page.evaluate(() => (window as unknown as { appearanceRequests: string[] }).appearanceRequests.at(-1));
  const textColor = () => page.locator('h1').evaluate(element => getComputedStyle(element).color);
  await page.goto('/');
  await expect.poll(lastNativeTheme).toBe('dark');
  const darkColor = await textColor();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect.poll(lastNativeTheme).toBe('light');
  const lightColor = await textColor();
  expect(lightColor).not.toBe(darkColor);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: '跟随系统', exact: true }).click();
  await expect.poll(lastNativeTheme).toBe('system');
  await expect.poll(textColor).toBe(lightColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(textColor).toBe(darkColor);
});

test('desktop connection errors never turn into sample device data', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: { invoke: () => Promise.reject(new Error('Disconnected')) },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByText('浏览器预览 · 以下为示例数据')).toHaveCount(0);
  await expect(page.getByText('Macintosh HD')).toHaveCount(0);
  await expect(page.getByText('数据待更新')).toBeVisible();
});
