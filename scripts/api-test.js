/**
 * 端到端 API 测试（需先启动服务：npm start）
 * 覆盖：配置、注册、登录、积分、单张生成、批量生成、高清放大、购买、历史、错误分支
 */
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const PHONE = `138${String(Date.now()).slice(-8)}`;
const PASSWORD = 'test123456';

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

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function makePngDataUrl() {
  const png = new PNG({ width: 96, height: 96 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 200;
    png.data[i + 1] = 180;
    png.data[i + 2] = 160;
    png.data[i + 3] = 255;
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

function makeJpegDataUrl() {
  const raw = { width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4) };
  for (let i = 0; i < raw.data.length; i += 4) {
    raw.data[i] = 120;
    raw.data[i + 1] = 170;
    raw.data[i + 2] = 220;
    raw.data[i + 3] = 255;
  }
  return `data:image/jpeg;base64,${jpeg.encode(raw, 90).data.toString('base64')}`;
}

async function main() {
  console.log('== 1. 公开配置 ==');
  const cfg = await api('/api/config');
  check('GET /api/config 返回 200', cfg.status === 200);
  check('配置包含 6 个标签维度', (cfg.data.tagGroups || []).length === 6);
  check('金属材质包含黑金/钛钢/三色金', ['blackgold', 'titanium', 'tricolor'].every((id) => (cfg.data.tagGroups.find((g) => g.id === 'metal')?.options || []).some((o) => o.id === id)));
  check('配石包含黄钻/粉钻/黑钻/渐变', ['yellow_diamond', 'pink_diamond', 'black_diamond', 'gradient'].every((id) => (cfg.data.tagGroups.find((g) => g.id === 'stone')?.options || []).some((o) => o.id === id)));
  check('配置包含镶嵌方式维度（6 种）', (cfg.data.tagGroups.find((g) => g.id === 'setting')?.options || []).length === 6);
  check('配置包含背景氛围维度（3 种）', (cfg.data.tagGroups.find((g) => g.id === 'atmosphere')?.options || []).length === 3);
  check('首饰类型包含手镯/胸针', ['bangle', 'brooch'].every((id) => (cfg.data.tagGroups.find((g) => g.id === 'jewelryType')?.options || []).some((o) => o.id === id)));
  check('设计风格包含装饰艺术/海洋主题等', ['artdeco', 'victorian', 'minimalism', 'pastoral', 'industrial', 'ocean'].every((id) => (cfg.data.tagGroups.find((g) => g.id === 'style')?.options || []).some((o) => o.id === id)));
  check('配置包含积分包', (cfg.data.packages || []).length >= 1);
  check('配置包含生成模型列表', Array.isArray(cfg.data.models) && cfg.data.models.length >= 2);
  check('模型列表包含 Gemini 3.1 Flash', (cfg.data.models || []).some((m) => m.id === 'gemini-3.1-flash'));
  check('模型列表包含 GPT Image 2 Pro', (cfg.data.models || []).some((m) => m.id === 'gpt-image-2-pro'));
  check('配置包含表现风格（4 种）', (cfg.data.renderStyles || []).length === 4);
  check('配置包含视图数量（3 种）', (cfg.data.viewModes || []).length === 3);
  check('配置包含图片比例（5 种）', (cfg.data.ratios || []).length === 5);
  check('配石包含围两圈小钻', ((cfg.data.tagGroups || []).find((g) => g.id === 'stone')?.options || []).some((o) => o.id === 'double_circle_diamonds'));

  console.log('== 2. 注册 ==');
  const reg = await api('/api/register', {
    method: 'POST',
    body: { phone: PHONE, password: PASSWORD, nickname: '测试用户' },
  });
  check('POST /api/register 返回 201', reg.status === 201, JSON.stringify(reg.data));
  check('注册赠送积分 = 3', reg.data.user && reg.data.user.credits === 3);
  check('返回 JWT token', typeof reg.data.token === 'string' && reg.data.token.length > 20);
  const token = reg.data.token;

  const dup = await api('/api/register', {
    method: 'POST',
    body: { phone: PHONE, password: PASSWORD },
  });
  check('重复注册返回 409', dup.status === 409);

  const badPhone = await api('/api/register', {
    method: 'POST',
    body: { phone: '123', password: PASSWORD },
  });
  check('非法手机号返回 400', badPhone.status === 400);

  console.log('== 3. 登录 ==');
  const login = await api('/api/login', {
    method: 'POST',
    body: { phone: PHONE, password: PASSWORD },
  });
  check('POST /api/login 返回 200', login.status === 200);
  const badLogin = await api('/api/login', {
    method: 'POST',
    body: { phone: PHONE, password: 'wrong-pass' },
  });
  check('错误密码返回 401', badLogin.status === 401);

  const wx = await api('/api/login/wechat', { method: 'POST', body: { code: 'wx-test-code-1' } });
  check('微信授权登录（模拟）成功', wx.status === 200 && !!wx.data.token);

  console.log('== 4. 积分查询 ==');
  const credits = await api('/api/user/credits', { token });
  check('GET /api/user/credits 返回 3', credits.data.credits === 3);
  const unauth = await api('/api/user/credits');
  check('未登录访问返回 401', unauth.status === 401);

  console.log('== 5. 单张生成（PNG 垫图） ==');
  const tags = {
    jewelryType: 'ring',
    style: 'vintage',
    metal: 'gold',
    stone: 'circle_diamonds',
  };
  const gen1 = await api('/api/generate', {
    method: 'POST',
    token,
    body: {
      image: makePngDataUrl(),
      uploadType: 'photo',
      tags,
      freeText: 'floral wreath design',
      count: 1,
      model: 'gemini-3.1-flash',
    },
  });
  check('POST /api/generate 返回 200', gen1.status === 200, JSON.stringify(gen1.data).slice(0, 200));
  check('返回 1 张结果', (gen1.data.results || []).length === 1);
  check('结果图片为 data URL', String(gen1.data.results[0].image).startsWith('data:image/png'));
  check('扣减 1 积分后余额为 2', gen1.data.creditsLeft === 2);
  const expectedPrompt =
    'ring vintage design yellow gold surrounded by a circle of small diamonds floral wreath design professional jewelry photography, studio lighting, pure white background, high resolution, 8k';
  check('提示词拼接符合规范', gen1.data.prompt === expectedPrompt, `\n  实际: ${gen1.data.prompt}`);
  check('裸石照片重绘幅度 0.4-0.6', gen1.data.denoisingStrength >= 0.4 && gen1.data.denoisingStrength <= 0.6);
  check('生成响应包含所选模型', gen1.data.model === 'gemini-3.1-flash', `实际: ${gen1.data.model}`);

  console.log('== 6. JPEG 垫图 + 手绘图重绘幅度 ==');
  const gen2 = await api('/api/generate', {
    method: 'POST',
    token,
    body: {
      image: makeJpegDataUrl(),
      uploadType: 'drawing',
      tags: { style: 'floral', stone: 'double_circle_diamonds' },
      freeText: '',
      count: 1,
      ratio: '4:3',
      style: 'watercolor',
      views: 'triple',
      coinReference: true,
    },
  });
  check('JPEG 垫图生成成功', gen2.status === 200 && (gen2.data.results || []).length === 1, JSON.stringify(gen2.data).slice(0, 200));
  check('手绘图重绘幅度 0.7-0.85', gen2.data.denoisingStrength >= 0.7 && gen2.data.denoisingStrength <= 0.85);
  check('水彩风格已拼入提示词', String(gen2.data.prompt).includes('delicate watercolor'));
  check('三视图已拼入提示词', String(gen2.data.prompt).includes('three views'));
  check('围两圈小钻已拼入提示词', String(gen2.data.prompt).includes('two circles of small diamonds'));
  check('硬币参照已拼入提示词', String(gen2.data.prompt).includes('one-yuan coin'));
  check('硬币参照开关状态回传', gen2.data.coinReference === true);

  console.log('== 7. 积分不足 ==');
  const poor = await api('/api/generate', {
    method: 'POST',
    token,
    body: { image: makePngDataUrl(), uploadType: 'photo', tags: {}, count: 4 },
  });
  check('积分不足返回 402', poor.status === 402 && poor.data.code === 'INSUFFICIENT_CREDITS');

  console.log('== 8. 购买积分 ==');
  const buy = await api('/api/credits/purchase', {
    method: 'POST',
    token,
    body: { packageId: 'p50' },
  });
  check('购买 50 元包到账 100 积分', buy.status === 200 && buy.data.credits === 101);
  const badPkg = await api('/api/credits/purchase', { method: 'POST', token, body: { packageId: 'nope' } });
  check('无效积分包返回 400', badPkg.status === 400);

  console.log('== 9. 批量生成 4 张 ==');
  const batch = await api('/api/generate', {
    method: 'POST',
    token,
    body: { image: makePngDataUrl(), uploadType: 'photo', tags, freeText: '', count: 4 },
  });
  check('批量生成返回 4 张', batch.status === 200 && (batch.data.results || []).length === 4);
  check('批量扣减 4 积分', batch.data.creditsLeft === 97);

  console.log('== 10. 高清放大 ==');
  const up = await api('/api/generate/upscale', {
    method: 'POST',
    token,
    body: { image: batch.data.results[0].image },
  });
  check('高清放大消耗 1 积分', up.status === 200 && up.data.creditsLeft === 96);

  console.log('== 11. 历史记录 ==');
  const history = await api('/api/user/history', { token });
  check('历史记录数量正确（6 条）', (history.data.records || []).length === 6, `实际 ${(history.data.records || []).length}`);
  check('历史记录包含模型字段', (history.data.records || []).every((r) => typeof r.model === 'string'));
  const tx = await api('/api/user/transactions', { token });
  check('积分流水包含充值/消耗', (tx.data.transactions || []).length >= 6);

  console.log('== 12. 新增标签选项生成 ==');
  const genNew = await api('/api/generate', {
    method: 'POST',
    token,
    body: {
      image: makePngDataUrl(),
      uploadType: 'photo',
      tags: {
        jewelryType: 'pendant',
        style: 'artdeco',
        metal: 'blackgold',
        setting: 'tension',
        stone: 'yellow_diamond',
        atmosphere: 'dark',
      },
      count: 1,
    },
  });
  check('新增标签生成成功', genNew.status === 200, JSON.stringify(genNew.data).slice(0, 200));
  check('装饰艺术已拼入提示词', String(genNew.data.prompt).includes('Art Deco'));
  check('黑金已拼入提示词', String(genNew.data.prompt).includes('black gold'));
  check('夹镶已拼入提示词', String(genNew.data.prompt).includes('tension setting'));
  check('黄钻已拼入提示词', String(genNew.data.prompt).includes('yellow diamond'));
  check('暗调已拼入提示词', String(genNew.data.prompt).includes('dark moody lighting'));
  check('提示词维度顺序符合模板', (() => {
    const p = String(genNew.data.prompt);
    const idx = ['pendant', 'Art Deco', 'black gold', 'tension setting', 'yellow diamond', 'dark moody lighting'].map((s) => p.indexOf(s));
    return idx.every((v) => v >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]);
  })(), genNew.data.prompt);

  console.log('== 13. 非法输入 ==');
  const noImg = await api('/api/generate', { method: 'POST', token, body: { uploadType: 'photo' } });
  check('缺少图片返回 400', noImg.status === 400);
  const badCount = await api('/api/generate', {
    method: 'POST',
    token,
    body: { image: makePngDataUrl(), uploadType: 'photo', count: 9 },
  });
  check('非法数量返回 400', badCount.status === 400);
  const badRatio = await api('/api/generate', {
    method: 'POST',
    token,
    body: { image: makePngDataUrl(), uploadType: 'photo', count: 1, ratio: '5:1' },
  });
  check('非法比例返回 400', badRatio.status === 400);
  const badStyle = await api('/api/generate', {
    method: 'POST',
    token,
    body: { image: makePngDataUrl(), uploadType: 'photo', count: 1, style: 'oil' },
  });
  check('非法表现风格返回 400', badStyle.status === 400);
  const badViews = await api('/api/generate', {
    method: 'POST',
    token,
    body: { image: makePngDataUrl(), uploadType: 'photo', count: 1, views: 'quad' },
  });
  check('非法视图数量返回 400', badViews.status === 400);

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('测试脚本异常:', err);
  process.exit(1);
});
