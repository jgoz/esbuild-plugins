import test from './serve-test';

test('page reloads as content changes', async ({ context, page, port, writeFile }) => {
  await page.goto(`http://127.0.0.1:${port}/`);

  test.expect(await page.textContent('h1')).toContain('Page One');

  await writeFile('2'); // error

  await page.waitForSelector('text=Oops :(');
  await page.screenshot({ path: __dirname + '/screenshots/oops.png' });

  await page.click('button.close');

  test.expect(await page.textContent('h1')).toContain('Page One');

  await writeFile('3'); // fixed

  const msg = await page.waitForEvent('console');
  test.expect(msg.text()).toBe('esbuild-plugin-livereload: reloading...');

  await page.waitForSelector('text=Oops :(', { state: 'detached' });

  await page.waitForSelector('text=Page Three');
  test.expect(await page.textContent('h1')).toContain('Page Three');
});
