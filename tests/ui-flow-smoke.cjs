// Browser-level regression checks with a deterministic Tauri bridge.
// This is NOT a substitute for an installed Windows WebView2 + Rust end-to-end test.
const assert = require('node:assert/strict');
const { chromium } = require('/tmp/liao-playwright/node_modules/playwright');
const BASE = 'http://127.0.0.1:1420';

(async () => {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  async function scenario(name, route, run) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      const calls = [];
      const callbacks = {};
      let nextCallback = 1;
      window.__liaoBridgeCalls = calls;
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(callback) {
          const id = ++nextCallback;
          callbacks[id] = callback;
          return id;
        },
        unregisterCallback(id) { delete callbacks[id]; },
        async invoke(command, payload = {}) {
          calls.push({ command, payload });
          switch (command) {
            case 'plugin:event|listen': return 1;
            case 'plugin:event|unlisten': return null;
            case 'signed_updater_available': return window.location.search.includes('mode=signed');
            case 'plugin:updater|check': return {
              rid: 41, currentVersion: '0.0.13', version: '0.0.14',
              date: '2026-10-14T10:00:00Z', body: '签名更新测试', rawJson: {}
            };
            case 'plugin:updater|download': return null;
            case 'plugin:updater|install': return null;
            case 'plugin:resources|close': return null;
            case 'plugin:dialog|open': return 'C:/fixtures/source.xlsx';
            case 'plugin:dialog|save': return 'C:/fixtures/template.xlsx';
            case 'load_update_settings':
              return { auto_check: true, last_check_time: 0, check_interval_hours: 24 };
            case 'save_update_settings': return null;
            case 'update_last_check_time': return null;
            case 'check_for_updates':
              return {
                current_version: '0.0.13', latest_version: '0.0.14',
                has_update: true, published_at: '2026-10-13T08:00:00Z',
                release_notes: '修复本地文件处理与更新提示',
                download_url: 'https://github.com/liao-works/liao-tools/releases',
                platform_specific_url: 'https://github.com/liao-works/liao-tools/releases/download/v0.0.14/liao-tools_x64-setup.exe',
                checksum_sha256: 'a'.repeat(64), file_size: 1024 * 1024
              };
            case 'download_update': return 'C:/Temp/liao-tools-update/liao-tools_0.0.14.exe';
            case 'install_update': return '安装程序已启动';
            case 'tax_has_local_data': return true;
            case 'tax_get_local_version': return { version: 'mock-v1', records: 812 };
            case 'tax_exact_search': return {
              code: payload.code, rate: '4%', north_ireland_rate: '6%',
              description: '回归测试商品', url: 'https://www.gov.uk/',
              north_ireland_url: 'https://www.gov.uk/',
              uk_rate_status: 'verified', ni_rate_status: 'conditional',
              uk_source_version: 'v1', ni_source_version: 'v1',
              uk_verified_at: '2026-10-13', ni_verified_at: null
            };
            case 'tax_fuzzy_search': return [];
            case 'get_database_info': return { total_items: 1783, db_size: 138400, last_update: '2026-10-13' };
            case 'query_hs_code': return {
              code: payload.hsCode,
              status: 'forbidden',
              description: '命中限制条目，含条件',
              matched_items: [{
                code: '850440', description: '示例限制项目',
                level: payload.matchLength || 6,
                raw_text: '850440 за исключением 8504401234',
                has_exceptions: true
              }]
            };
            case 'get_excel_config': return { weight_column: 8, box_column: 11 };
            case 'process_excel_file': return {
              success: true, output_path: 'C:/fixtures/excel-output.xlsx',
              message: '成功', logs: ['读取源文件', '文件处理完成']
            };
            case 'process_ups_dpd_file': return {
              success: true, output_path: 'C:/fixtures/shipping-output.xlsx',
              message: '成功', logs: ['转换完成']
            };
            case 'revcal_search': return [{
              asin: 'B0TEST001', title: '回归测试商品详情', brand: 'Test Brand',
              image_url: null, product_link: 'https://www.amazon.co.uk/',
              length: 12, width: 8, height: 3, dimension_unit: 'cm',
              weight: 0.35, weight_unit: 'kg', price: 18, currency: 'GBP',
              fee_category: 'Electronics', sales_rank: 21, sales_rank_context: 'Electronics',
              reviews_count: 13, rating: '4.2', offer_count: 1,
              dimensions_official: '12 × 8 × 3 cm'
            }];
            default: return null;
          }
        }
      };
    });
    const page = await context.newPage();
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
      await run(page);
      passed++;
      console.log('PASS ' + name);
    } catch (e) {
      console.error('FAIL ' + name + ': ' + (e.stack || e.message || e));
      await page.screenshot({ path: 'ui-screenshots/failure-' + name.replace(/[^a-z0-9-]/gi, '-') + '.png', fullPage: true }).catch(() => {});
      throw e;
    } finally {
      await context.close();
    }
  }
  try {
    await scenario('tax-query', '/tax', async page => {
      await page.locator('#lt-hs-input').fill('0101-210 000');
      await page.getByRole('button', { name: '开始查询' }).click();
      await page.getByText('商品与税率详情').waitFor();
      await page.locator('.lt-tax-sources').getByRole('heading', { name: '来源与核验' }).waitFor();
      const calls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(calls.some(call => call.command === 'tax_exact_search' && call.payload.code === '0101210000'),
        'tax backend must receive normalized numeric code');
    });
    await scenario('alta-restrictions', '/alta', async page => {
      await page.locator('#alta-hs-code').fill('8504-40');
      await page.getByRole('button', { name: '检查禁运' }).click();
      await page.locator('.lt-alta-verdict').getByText('命中禁运条目').waitFor();
      await page.getByText('8504401234').first().waitFor();
      const calls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(calls.some(call => call.command === 'query_hs_code' && call.payload.hsCode === '850440'),
        'Alta backend must receive normalized numeric code');
    });
    await scenario('excel-process', '/excel', async page => {
      await page.getByRole('button', { name: '选择文件' }).first().click();
      await page.getByText('source.xlsx').first().waitFor();
      await page.getByRole('button', { name: '开始处理' }).click();
      await page.getByText('excel-output.xlsx').first().waitFor();
      const calls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(calls.some(call => call.command === 'process_excel_file' &&
        call.payload.request.file_path === 'C:/fixtures/source.xlsx'));
    });
    await scenario('shipping-process', '/ups-dpd', async page => {
      await page.locator('.lt-operation-drop').first().getByRole('button', { name: '选择文件' }).click();
      await page.getByText('source.xlsx').first().waitFor();
      await page.getByRole('button', { name: '开始处理' }).click();
      await page.getByText('shipping-output.xlsx').first().waitFor();
      const calls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(calls.some(call => call.command === 'process_ups_dpd_file' &&
        call.payload.request.template_type === 'ups'));
    });
    await scenario('amazon-detail', '/revcal', async page => {
      await page.getByPlaceholder('例如：B0GD7VRN9V').fill('B0TEST001');
      await page.locator('.lt-product-search-grid').getByRole('button', { name: '查询', exact: true }).click();
      await page.getByRole('button', { name: '详情' }).first().click();
      await page.getByRole('dialog').getByText('商品信息详情').waitFor();
      await page.getByRole('dialog').getByText('回归测试商品详情').waitFor();
    });
    await scenario('secure-update-center', '/updates', async page => {
      await page.getByRole('heading', { name: '发现可用的新版本' }).waitFor();
      await page.screenshot({ path: 'ui-screenshots/updates-new-version-mocked.png', fullPage: true });
      await page.getByRole('button', { name: '下载并验证更新' }).click();
      await page.getByText('下载完成，完整性校验通过').waitFor();
      await page.screenshot({ path: 'ui-screenshots/updates-verified-mocked.png', fullPage: true });
      const calls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(calls.some(call => call.command === 'download_update' &&
        call.payload.checksumSha256 === 'a'.repeat(64)), 'download must supply official digest');
      await page.getByRole('button', { name: '打开系统安装程序' }).click();
      await page.getByText('安装程序已启动').first().waitFor();
      const finalCalls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(finalCalls.some(call => call.command === 'install_update' && call.payload.silent === false),
        'update should never silently install without consent');
    });
    await scenario('official-signed-update', '/updates?mode=signed', async page => {
      await page.getByRole('heading', { name: '发现可用的新版本' }).waitFor();
      await page.getByText('官方签名更新').first().waitFor();
      const startCalls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(startCalls.some(call => call.command === 'plugin:updater|check'),
        'trusted signed channel must use official updater check');
      assert(!startCalls.some(call => call.command === 'check_for_updates'),
        'trusted signed channel must not silently downgrade to unsigned legacy updater');
      await page.getByRole('button', { name: '下载签名更新包' }).click();
      await page.getByText('签名更新包已下载并验证').waitFor();
      await page.getByRole('button', { name: '安装已签名更新' }).click();
      await page.getByText('签名更新安装已执行').waitFor();
      const calls = await page.evaluate(() => window.__liaoBridgeCalls);
      assert(calls.some(call => call.command === 'plugin:updater|download'), 'signed download must use native updater');
      assert(calls.some(call => call.command === 'plugin:updater|install'), 'signed install must use native updater');
      assert(!calls.some(call => call.command === 'install_update' || call.command === 'download_update'),
        'signed release must never call unsigned installer backend');
    });
    console.log('PASS all ' + passed + ' mocked native-bridge browser scenarios');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
