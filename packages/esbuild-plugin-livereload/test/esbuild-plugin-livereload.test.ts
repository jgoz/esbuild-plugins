import test from './serve-test';

test('page reloads as content changes', async ({ page, port, writeFile }) => {
  await page.goto(`http://127.0.0.1:${port}/`);

  test.expect(await page.textContent('h1')).toContain('Page One');

  await writeFile(['2-error.svelte', 'entry.svelte']); // error

  await page.waitForSelector('text=Oops :(');
  test.expect(await page.screenshot()).toMatchSnapshot('oops.png');

  await page.click('button.close', { force: true, strict: true });

  test.expect(await page.textContent('h1')).toContain('Page One');

  await writeFile(['3-fixed.svelte', 'entry.svelte']); // fixed

  const msg = await page.waitForEvent('console');
  test.expect(msg.text()).toBe('esbuild-plugin-livereload: reloading...');

  await page.waitForSelector('text=Oops :(', { state: 'detached' });

  await page.waitForSelector('text=Page Three');
  test.expect(await page.textContent('h1')).toContain('Page Three');
});

test('page replaces stylesheets without reloading', async ({ page, port, writeFile }) => {
  await page.goto(`http://127.0.0.1:${port}/`);

  const body = await page.$('body');
  if (!body) throw new Error('Umm.. no body?');

  test
    .expect(await body.evaluate(b => window.getComputedStyle(b).backgroundColor))
    .toBe('rgb(255, 255, 255)');

  await writeFile(['style-2.css', 'style.css']);

  await page.waitForRequest(/\.css\?_hash=/);
  test
    .expect(await body.evaluate(b => window.getComputedStyle(b).backgroundColor))
    .toBe('rgb(135, 206, 250)');

  await writeFile(['style-1.css', 'style.css']);

  await page.waitForRequest(/\.css\?_hash=/);
  test
    .expect(await body.evaluate(b => window.getComputedStyle(b).backgroundColor))
    .toBe('rgb(255, 255, 255)');
});
