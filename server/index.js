/**
 * AI珠宝设计生成器 - 后端服务
 * Express + SQLite(sql.js) + JWT + 积分系统 + AI 图生图代理
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
const { signToken, authRequired } = require('./auth');
const {
  TAG_GROUPS,
  NEGATIVE_PROMPT,
  RENDER_STYLES,
  VIEW_MODES,
  buildPrompt,
  getTagsLabel,
  getDenoisingStrength,
} = require('./prompts');
const banana = require('./banana');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SIGNUP_BONUS = Number(process.env.SIGNUP_BONUS_CREDITS) || 3;

const RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
];
const VALID_RATIOS = RATIOS.map((r) => r.id);

app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ===================== 工具函数 ===================== */

function publicUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname || '',
    avatar: user.avatar || '',
    credits: user.credits,
    createdAt: user.created_at,
  };
}

function validPhone(phone) {
  return /^1[3-9]\d{9}$/.test(String(phone));
}

function assertImageDataUrl(value) {
  if (typeof value !== 'string' || !/^data:image\/(png|jpe?g|webp|heic);base64,/i.test(value)) {
    const err = new Error('图片格式无效，请上传 JPG / PNG / HEIC 图片');
    err.status = 400;
    throw err;
  }
  const size = Buffer.from(value.split(',')[1] || '', 'base64').length;
  if (size > 25 * 1024 * 1024) {
    const err = new Error('图片过大（超过 25MB）');
    err.status = 400;
    throw err;
  }
}

/** 积分包：定价示例（50元=100积分） */
const PACKAGES = [
  { id: 'p10', name: '体验包', price: 10, credits: 15, priceLabel: '¥10' },
  { id: 'p30', name: '标准包', price: 30, credits: 50, priceLabel: '¥30' },
  { id: 'p50', name: '超值包', price: 50, credits: 100, priceLabel: '¥50', hot: true },
];

/* ===================== 公开接口 ===================== */

app.get('/api/config', (req, res) => {
  res.json({
    demoMode: banana.isDemoMode,
    provider: banana.provider,
    models: banana.getModels(),
    ratios: RATIOS,
    renderStyles: RENDER_STYLES,
    viewModes: VIEW_MODES,
    signupBonus: SIGNUP_BONUS,
    packages: PACKAGES,
    tagGroups: TAG_GROUPS,
    negativePrompt: NEGATIVE_PROMPT,
  });
});

app.post('/api/register', async (req, res, next) => {
  try {
    const { phone, password, nickname } = req.body || {};
    if (!validPhone(phone)) {
      return res.status(400).json({ error: '请输入正确的 11 位手机号', code: 'INVALID_PHONE' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位', code: 'INVALID_PASSWORD' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
      user = db.registerUser({ phone, passwordHash, nickname });
    } catch (err) {
      return res.status(409).json({ error: '该手机号已注册', code: 'PHONE_EXISTS' });
    }
    db.addCredits(user.id, SIGNUP_BONUS, 'signup_bonus', '新用户注册赠送免费生成额度');
    user = db.getUserById(user.id);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    const user = db.getUserByPhone(String(phone || ''));
    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      return res.status(401).json({ error: '手机号或密码错误', code: 'BAD_CREDENTIALS' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

/**
 * 微信授权登录（模拟实现）
 * 未配置 WECHAT_APP_ID / WECHAT_APP_SECRET 时，用 code 的哈希值生成稳定账号，
 * 便于本地体验完整流程；接入真实微信登录时补充 code2session 调用即可。
 */
app.post('/api/login/wechat', async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: '缺少微信授权 code', code: 'MISSING_CODE' });

    const digest = crypto.createHash('sha256').update(String(code)).digest('hex').slice(0, 20);
    const phone = `wx_${digest}`;
    const nickname = `微信用户_${digest.slice(0, 6)}`;

    let user = db.getUserByPhone(phone);
    if (!user) {
      const passwordHash = await bcrypt.hash(`wechat-${digest}-${Date.now()}`, 10);
      user = db.registerUser({ phone, passwordHash, nickname });
      db.addCredits(user.id, SIGNUP_BONUS, 'signup_bonus', '新用户注册赠送免费生成额度');
      user = db.getUserById(user.id);
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

/* ===================== 需登录接口 ===================== */

app.get('/api/user/credits', authRequired, (req, res, next) => {
  try {
    const user = db.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: '用户不存在', code: 'NOT_FOUND' });
    res.json({ credits: user.credits, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/history', authRequired, (req, res, next) => {
  try {
    const records = db.getGenerationRecords(req.userId, 50).map((r) => ({
      id: r.id,
      type: r.type,
      prompt: r.prompt,
      tags: JSON.parse(r.tags_json || '[]'),
      denoisingStrength: r.denoising_strength,
      model: r.model || '',
      createdAt: r.created_at,
    }));
    res.json({ records });
  } catch (err) {
    next(err);
  }
});

app.get('/api/user/transactions', authRequired, (req, res, next) => {
  try {
    res.json({ transactions: db.getCreditTransactions(req.userId, 50) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/generate', authRequired, async (req, res, next) => {
  try {
    const {
      image,
      uploadType = 'photo',
      tags = {},
      freeText = '',
      count = 1,
      model,
      ratio = '1:1',
      style = 'physical',
      views = 'single',
      coinReference = false,
    } = req.body || {};
    const n = Number(count);
    if (![1, 2, 3, 4].includes(n)) {
      return res.status(400).json({ error: '生成数量仅支持 1-4 张', code: 'INVALID_COUNT' });
    }
    if (!['photo', 'drawing'].includes(uploadType)) {
      return res.status(400).json({ error: '上传类型无效', code: 'INVALID_TYPE' });
    }
    if (!VALID_RATIOS.includes(ratio)) {
      return res.status(400).json({ error: '图片比例无效', code: 'INVALID_RATIO' });
    }
    if (!RENDER_STYLES.some((s) => s.id === style)) {
      return res.status(400).json({ error: '表现风格无效', code: 'INVALID_STYLE' });
    }
    if (!VIEW_MODES.some((v) => v.id === views)) {
      return res.status(400).json({ error: '视图数量无效', code: 'INVALID_VIEWS' });
    }
    assertImageDataUrl(image);

    // 默认「实物 + 单视图」不追加额外片段，保持标准提示词
    const coinRef = coinReference === true || coinReference === 'true';
    const stylePrompt =
      style === 'physical' ? '' : (RENDER_STYLES.find((s) => s.id === style) || {}).prompt;
    const viewPrompt =
      views === 'single' ? '' : (VIEW_MODES.find((v) => v.id === views) || {}).prompt;
    let prompt = [buildPrompt(tags, freeText), stylePrompt, viewPrompt].filter(Boolean).join(' ');
    let negativePrompt = NEGATIVE_PROMPT;
    if (coinRef) {
      // 硬币参照：告诉 AI 用一元硬币（直径 25mm）估算裸石实际尺寸，并在负面词中排除硬币
      prompt = `${prompt} A Chinese one-yuan coin (25mm diameter) is visible in the input photo as a size reference; use it to estimate the gemstone's real size and render the jewelry at that scale.`;
      negativePrompt = `${NEGATIVE_PROMPT}, coin, currency, money`;
    }
    const denoisingStrength = getDenoisingStrength(uploadType);
    let modelId = '';
    if (!banana.isDemoMode) {
      const models = banana.getModels();
      const chosen = models.find((m) => m.id === model) || models[0];
      if (!chosen || !chosen.available) {
        return res.status(400).json({
          error: '所选模型当前不可用，请确认中转站已开通该模型后重启服务',
          code: 'MODEL_UNAVAILABLE',
        });
      }
      modelId = chosen.id;
    } else if (['gemini-3.1-flash', 'gpt-image-2-pro'].includes(model)) {
      modelId = model; // 演示模式：仅记录用户选择的模型，不真正路由
    }
    const user = db.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: '用户不存在', code: 'NOT_FOUND' });
    if (user.credits < n) {
      return res.status(402).json({
        error: '积分不足，请先购买积分',
        code: 'INSUFFICIENT_CREDITS',
        needed: n,
        credits: user.credits,
      });
    }

    const results = [];
    for (let i = 0; i < n; i += 1) {
      const out = await banana.generateImage({
        imageDataUrl: image,
        prompt,
        negativePrompt,
        denoisingStrength,
        variant: i, // 演示模式下产生 4 种不同观感的模拟效果
        modelId,
        ratio,
      });
      const nonce = Math.random().toString(36).slice(2, 8);
      results.push({ id: `${Date.now()}-${nonce}-${i}`, image: out });
    }

    const updated = db.deductCredits(user.id, n);
    for (let i = 0; i < n; i += 1) {
      db.addGenerationRecord({
        userId: user.id,
        type: uploadType,
        prompt,
        negativePrompt,
        tags,
        denoisingStrength,
        model: modelId,
      });
    }

    res.json({
      results,
      prompt,
      tagsLabel: getTagsLabel(tags),
      uploadType,
      denoisingStrength,
      creditsLeft: updated.credits,
      demoMode: banana.isDemoMode,
      model: modelId,
      ratio,
      style,
      views,
      coinReference: coinRef,
    });
  } catch (err) {
    next(err);
  }
});

/** 高清放大（增值服务）：消耗 1 积分 */
app.post('/api/generate/upscale', authRequired, async (req, res, next) => {
  try {
    const { image, prompt = '', model } = req.body || {};
    assertImageDataUrl(image);
    let modelId = '';
    if (!banana.isDemoMode) {
      const models = banana.getModels();
      const chosen = models.find((m) => m.id === model) || models[0];
      if (!chosen || !chosen.available) {
        return res.status(400).json({
          error: '所选模型当前不可用，请确认中转站已开通该模型后重启服务',
          code: 'MODEL_UNAVAILABLE',
        });
      }
      modelId = chosen.id;
    }
    const user = db.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: '用户不存在', code: 'NOT_FOUND' });
    if (user.credits < 1) {
      return res.status(402).json({
        error: '积分不足，请先购买积分',
        code: 'INSUFFICIENT_CREDITS',
        needed: 1,
        credits: user.credits,
      });
    }
    const out = await banana.upscaleImage({
      imageDataUrl: image,
      prompt,
      negativePrompt: NEGATIVE_PROMPT,
      modelId,
    });
    const updated = db.deductCredits(user.id, 1);
    res.json({ image: out, creditsLeft: updated.credits, demoMode: banana.isDemoMode, model: modelId });
  } catch (err) {
    next(err);
  }
});

/** 积分包购买（演示：直接入账；真实支付接入时在此处校验支付回调） */
app.post('/api/credits/purchase', authRequired, (req, res, next) => {
  try {
    const { packageId } = req.body || {};
    const pkg = PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return res.status(400).json({ error: '积分包不存在', code: 'INVALID_PACKAGE' });
    const updated = db.addCredits(req.userId, pkg.credits, 'purchase', `购买${pkg.name} ${pkg.priceLabel}`);
    res.json({ credits: updated.credits, package: pkg });
  } catch (err) {
    next(err);
  }
});

/* ===================== 错误处理 ===================== */

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '图片过大，请压缩后重试', code: 'PAYLOAD_TOO_LARGE' });
  }
  console.error('[server]', err);
  const status = err.status || 500;
  const message = status === 500 ? '服务器开小差了，请稍后重试' : err.message;
  res.status(status).json({ error: message, code: err.code || 'INTERNAL' });
});

db.init()
  .then(async () => {
    await banana.refreshRelayModels();
    app.listen(PORT, () => {
      console.log(`AI 珠宝设计生成器已启动: http://localhost:${PORT}`);
      console.log(`生成模式: ${banana.isDemoMode ? '演示模式（未配置 API Key）' : `真实模式（${banana.provider}）`}`);
    });
  })
  .catch((err) => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  });
