/**
 * 浏览器端到端 UI 测试（通过 Chrome DevTools Protocol 驱动真实页面）
 * 前置：1) npm start 已启动服务  2) 本机装有 Chrome
 * 覆盖：注册登录态、上传垫图、标签选择、提示词预览、单张生成、
 *       积分不足弹窗、购买积分、批量生成、高清放大
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CHROME = process.env.CHROME_PATH || 'C:\\Users\\admin\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9333);
const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const OUT_DIR = process.env.SHOT_DIR || os.tmpdir();

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
        }
      } else {
        this.events.push(msg);
        const list = this.listeners.get(msg.method) || [];
        list.forEach((fn) => fn(msg.params));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`等待 ${method} 超时`));
      }, timeoutMs);
      const fn = (params) => {
        cleanup();
        resolve(params);
      };
      const cleanup = () => {
        clearTimeout(timer);
        const list = this.listeners.get(method) || [];
        this.listeners.set(method, list.filter((f) => f !== fn));
      };
      this.listeners.set(method, [...(this.listeners.get(method) || []), fn]);
    });
  }
}

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jewelry-ui-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--window-size=390,844',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let targets = [];
  for (let i = 0; i < 60; i += 1) {
    try {
      targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (targets.length) break;
    } catch (err) {
      /* 等待 Chrome 启动 */
    }
    await sleep(250);
  }
  if (!targets.length) throw new Error('Chrome DevTools 端口未就绪');

  const page = targets.find((t) => t.type === 'page');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  const loadPromise = cdp.once('Page.loadEventFired', 15000);
  await cdp.send('Page.navigate', { url: BASE });
  await loadPromise;
  await sleep(1200);

  async function evalJS(expression) {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`页面脚本执行失败: ${JSON.stringify(res.exceptionDetails).slice(0, 400)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  async function waitFor(expr, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evalJS(expr)) return true;
      await sleep(300);
    }
    return false;
  }

  console.log('== 1. 页面加载 ==');
  check('标题正确', (await evalJS('document.title')) === 'AI珠宝设计生成器');
  check('演示模式提示可见', await evalJS(`!document.getElementById('demoBanner').hidden`));
  check('模型选择区显示两个模型', await evalJS(`document.querySelectorAll('#modelRow .tag-chip').length === 2`));
  check('模型对外名称为超高质量2.0/高质量1.0', await evalJS(`[...document.querySelectorAll('#modelRow .tag-chip')].map((c) => c.textContent).join(',') === '超高质量2.0,高质量1.0'`));
  check('比例选择区显示 5 个比例', await evalJS(`document.querySelectorAll('#ratioRow .tag-chip').length === 5`));
  check('默认比例 1:1 选中', await evalJS(`document.querySelector('#ratioRow .tag-chip.selected')?.dataset.ratio === '1:1'`));
  check('表现风格区显示 4 种', await evalJS(`document.querySelectorAll('#styleRow .tag-chip').length === 4`));
  check('默认表现风格为实物', await evalJS(`document.querySelector('#styleRow .tag-chip.selected')?.dataset.style === 'physical'`));
  check('视图数量区显示 3 种', await evalJS(`document.querySelectorAll('#viewRow .tag-chip').length === 3`));
  check('默认视图为单视图', await evalJS(`document.querySelector('#viewRow .tag-chip.selected')?.dataset.views === 'single'`));
  check('生成 2 张按钮存在', await evalJS(`document.getElementById('generate2Btn') !== null`));
  check('硬币参照开关存在', await evalJS(`document.getElementById('coinRef') !== null`));
  check('历史网格手机一行 2 个', await evalJS(`getComputedStyle(document.querySelector('.history-grid')).gridTemplateColumns.split(' ').length === 2`));

  console.log('== 2. 注册并建立登录态 ==');
  await evalJS(`(async () => {
    const phone = '139' + String(Date.now()).slice(-8);
    const r = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password: 'test123456', nickname: 'UI测试' }),
    });
    const d = await r.json();
    localStorage.setItem('token', d.token);
    localStorage.setItem('user', JSON.stringify(d.user));
    setTimeout(() => location.reload(), 0);
    return true;
  })()`);
  await sleep(1800);
  check('顶部显示积分 3', await waitFor(`document.getElementById('creditsNum')?.textContent === '3'`));

  console.log('== 3. 上传垫图 ==');
  await evalJS(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F5F7'; ctx.fillRect(0, 0, 320, 320);
    ctx.fillStyle = '#B9D8FF';
    ctx.beginPath(); ctx.moveTo(160, 40); ctx.lineTo(260, 160); ctx.lineTo(160, 280); ctx.lineTo(60, 160); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7FC4FF';
    ctx.beginPath(); ctx.moveTo(160, 100); ctx.lineTo(220, 160); ctx.lineTo(160, 220); ctx.lineTo(100, 160); ctx.closePath(); ctx.fill();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'gem.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  check('上传缩略图出现', await waitFor(`!document.getElementById('dzFilled').hidden`));
  check('主视觉区显示垫图', await evalJS(`document.querySelectorAll('#heroImages img').length === 1`));

  console.log('== 4. 选择标签 + 提示词预览 ==');
  await evalJS(`(() => {
    const click = (label) => {
      const el = [...document.querySelectorAll('.tag-chip')].find((c) => c.textContent === label);
      if (el) el.click();
    };
    click('戒指'); click('复古'); click('黄金'); click('围一圈小钻');
    const ft = document.getElementById('freeText');
    ft.value = 'floral wreath design';
    ft.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const preview = await evalJS(`document.getElementById('promptPreview').textContent`);
  check(
    '提示词预览拼接正确',
    preview.includes('ring vintage design yellow gold surrounded by a circle of small diamonds floral wreath design'),
    preview.slice(0, 120)
  );
  check('选中标签高亮', await evalJS(`document.querySelectorAll('#tagGroups .tag-chip.selected').length === 4`));
  check('开启硬币参照显示指引', await evalJS(`(() => {
    const el = document.getElementById('coinRef');
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return !document.getElementById('coinHint').hidden && document.getElementById('coinHint').textContent.includes('一元硬币');
  })()`));

  console.log('== 5. 单张生成 ==');
  await evalJS(`document.getElementById('generateBtn').click()`);
  check('生成完成后积分扣为 2', await waitFor(`document.getElementById('creditsNum')?.textContent === '2'`, 25000));
  check('底部结果区显示 1 张结果', await evalJS(`document.querySelectorAll('#resultStage img').length === 1`));
  check('点击结果图打开高清查看器', await evalJS(`(() => {
    const img = document.querySelector('#resultStage img');
    if (!img) return false;
    img.click();
    return true;
  })()`));
  check('查看器显示高清大图', await waitFor(`!document.getElementById('viewer').hidden && document.getElementById('viewerImg').src.startsWith('data:')`));
  check('关闭查看器', await evalJS(`document.getElementById('viewerClose').click(); true`));
  check('查看器已关闭', await waitFor(`document.getElementById('viewer').hidden`));
  check('历史卡片出现', await evalJS(`document.querySelectorAll('.result-card').length === 1`));
  check('下载按钮已显示', await evalJS(`[...document.querySelectorAll('.result-card .btn-primary')].some((b) => b.textContent === '下载原图')`));
  const toastText = await evalJS(`document.getElementById('toastWrap').textContent`);
  check('生成成功提示', toastText.includes('生成成功'), toastText.slice(0, 60));

  console.log('== 6. 积分不足 → 购买弹窗 ==');
  await evalJS(`document.getElementById('batchBtn').click()`);
  check('弹出购买弹窗', await waitFor(`!document.getElementById('purchaseModal').hidden`));

  console.log('== 7. 购买积分 ==');
  await evalJS(`document.querySelector('.pkg-buy').click()`);
  check('购买后积分变为 17', await waitFor(`document.getElementById('creditsNum')?.textContent === '17'`));
  check('购买弹窗关闭', await waitFor(`document.getElementById('purchaseModal').hidden`));

  console.log('== 8. 批量生成 4 张 ==');
  await evalJS(`document.getElementById('batchBtn').click()`);
  check('批量后积分扣为 13', await waitFor(`document.getElementById('creditsNum')?.textContent === '13'`, 40000));
  check('底部结果区显示 4 张结果', await evalJS(`document.querySelectorAll('#resultStage img').length === 4`));
  check('历史卡片共 5 张', await evalJS(`document.querySelectorAll('.result-card').length === 5`));

  console.log('== 9. 高清放大 ==');
  await evalJS(`document.querySelector('.result-card .btn-ghost').click()`);
  check('高清放大后积分扣为 12', await waitFor(`document.getElementById('creditsNum')?.textContent === '12'`, 25000));

  console.log('== 10. 截图 ==');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const shotFile = path.join(OUT_DIR, `ui-full-${Date.now()}.png`);
  fs.writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));
  console.log(`  截图已保存: ${shotFile}`);

  const jsErrors = cdp.events.filter(
    (e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  );
  check('页面无 JS 错误', jsErrors.length === 0, JSON.stringify(jsErrors[0] || {}).slice(0, 200));

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  cdp.ws.close();
  chrome.kill();
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch (err) {
    /* Chrome 退出释放句柄有延迟，清理失败不影响测试结果 */
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('UI 测试异常:', err.message);
  process.exit(1);
});
