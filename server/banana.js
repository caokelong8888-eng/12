/**
 * AI 图生图调用层（多模型）
 *
 * 支持模型：
 *   - gemini   : Gemini 3.x Image（Google 原生 generateContent 格式，垫图走 inlineData）
 *   - gpt-image: GPT Image（OpenAI 兼容 /v1/images/generations，image 参数传垫图）
 *   - aimlapi / openai：旧单供应商通道（保留兼容）
 *
 * 演示模式：未配置任何 API Key 时，用本地纯 JS 图像处理模拟生成，
 * 便于在没有付费 API 的情况下完整跑通注册、积分、生成、下载全流程。
 */
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

/* ============ 中转站（gemai.cc，Gemini 原生通道）============ */
const RELAY_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const RELAY_BASE_URL = (process.env.GEMINI_BASE_URL || 'https://api.gemai.cc').replace(/\/+$/, '');
const GEMINI_MODEL = (process.env.GEMINI_MODEL || '[官]gemini-3.1-flash-image-preview').trim();
let GEMINI_IMAGE_CONFIG = null;
try {
  GEMINI_IMAGE_CONFIG = process.env.GEMINI_IMAGE_CONFIG
    ? JSON.parse(process.env.GEMINI_IMAGE_CONFIG)
    : null;
} catch (e) {
  GEMINI_IMAGE_CONFIG = null;
}

/* ============ GPT Image 2 Pro（同一中转站的 OpenAI 兼容通道）============ */
const GPT_IMAGE_MODEL = (process.env.GPT_IMAGE_MODEL || '[官]gpt-image-2-pro').trim();
const GPT_IMAGE_BASE_URL = (process.env.GPT_IMAGE_BASE_URL || RELAY_BASE_URL).replace(/\/+$/, '');
const GPT_IMAGE_API_KEY = (process.env.GPT_IMAGE_API_KEY || RELAY_API_KEY).trim();
const GPT_IMAGE_SIZE = (process.env.GPT_IMAGE_SIZE || '1024x1024').trim();
const GPT_IMAGE_QUALITY = (process.env.GPT_IMAGE_QUALITY || 'high').trim();
const GPT_IMAGE_STYLE = (process.env.GPT_IMAGE_STYLE || 'vivid').trim();
const GPT_IMAGE_IMAGE_FIELD = (process.env.GPT_IMAGE_IMAGE_FIELD || 'image').trim();
let GPT_IMAGE_EXTRA_BODY = null;
try {
  GPT_IMAGE_EXTRA_BODY = process.env.GPT_IMAGE_EXTRA_BODY ? JSON.parse(process.env.GPT_IMAGE_EXTRA_BODY) : null;
} catch (e) {
  GPT_IMAGE_EXTRA_BODY = null;
}

/* ============ 旧单供应商通道（AIMLAPI / 任意 OpenAI 兼容）============ */
const AIMLAPI_API_KEY = (process.env.AIMLAPI_API_KEY || '').trim();
const AIMLAPI_MODEL = (process.env.AIMLAPI_MODEL || 'google/nano-banana-pro-edit').trim();
const AIMLAPI_BASE_URL = (process.env.AIMLAPI_BASE_URL || 'https://api.aimlapi.com').replace(/\/+$/, '');
const AIMLAPI_ASPECT_RATIO = (process.env.AIMLAPI_ASPECT_RATIO || '1:1').trim();
const AIMLAPI_RESOLUTION = (process.env.AIMLAPI_RESOLUTION || '1K').trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || '').replace(/\/+$/, '');
const OPENAI_MODEL = (process.env.OPENAI_MODEL || '').trim();
const OPENAI_IMAGE_FIELD = (process.env.OPENAI_IMAGE_FIELD || 'image_urls').trim();
let OPENAI_EXTRA_BODY = null;
try {
  OPENAI_EXTRA_BODY = process.env.OPENAI_EXTRA_BODY ? JSON.parse(process.env.OPENAI_EXTRA_BODY) : null;
} catch (e) {
  OPENAI_EXTRA_BODY = null;
}

const GENERATE_TIMEOUT_MS = 180000;

/** 图片比例 → GPT Image 尺寸映射（OpenAI 兼容） */
const RATIO_SIZES = {
  '1:1': '1024x1024',
  '3:4': '1024x1536',
  '4:3': '1536x1024',
  '9:16': '1024x1792',
  '16:9': '1792x1024',
};

const VALID_RATIOS = Object.keys(RATIO_SIZES);

function normalizeRatio(ratio) {
  const r = String(ratio || '1:1');
  return VALID_RATIOS.includes(r) ? r : '1:1';
}

/* ============ 模型注册表 ============ */

function buildModels() {
  const models = [];
  if (RELAY_API_KEY) {
    models.push({
      id: 'gemini-3.1-flash',
      label: '超高质量2.0',
      kind: 'gemini',
      model: GEMINI_MODEL,
      baseUrl: RELAY_BASE_URL,
      apiKey: RELAY_API_KEY,
    });
    models.push({
      id: 'gpt-image-2-pro',
      label: '高质量1.0',
      kind: 'gpt-image',
      model: GPT_IMAGE_MODEL,
      baseUrl: GPT_IMAGE_BASE_URL,
      apiKey: GPT_IMAGE_API_KEY,
    });
  }
  if (AIMLAPI_API_KEY) {
    models.push({
      id: 'aimlapi',
      label: 'AIMLAPI Nano Banana',
      kind: 'aimlapi',
      model: AIMLAPI_MODEL,
      baseUrl: AIMLAPI_BASE_URL,
      apiKey: AIMLAPI_API_KEY,
    });
  }
  if (OPENAI_BASE_URL && OPENAI_API_KEY && OPENAI_MODEL) {
    models.push({
      id: 'openai',
      label: OPENAI_MODEL,
      kind: 'openai',
      model: OPENAI_MODEL,
      baseUrl: OPENAI_BASE_URL,
      apiKey: OPENAI_API_KEY,
    });
  }
  return models;
}

const CONFIGURED_MODELS = buildModels();
const isDemoMode = CONFIGURED_MODELS.length === 0;
const provider = isDemoMode ? null : CONFIGURED_MODELS[0].kind;

/** 中转站可访问模型缓存（启动时探测，null 表示未知/探测失败） */
let relayAccessible = null;

async function refreshRelayModels() {
  if (!RELAY_API_KEY) return;
  try {
    const res = await fetch(`${RELAY_BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${RELAY_API_KEY}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    relayAccessible = (data.data || []).map((m) => String(m.id).toLowerCase());
  } catch (e) {
    relayAccessible = null;
  }
}

/** 对外模型列表：demo 模式全部可用；真实模式按中转站实际授权过滤 */
function getModels() {
  if (isDemoMode) {
    return [
      { id: 'gemini-3.1-flash', label: '超高质量2.0', kind: 'demo', model: GEMINI_MODEL, available: true },
      { id: 'gpt-image-2-pro', label: '高质量1.0', kind: 'demo', model: GPT_IMAGE_MODEL, available: true },
    ];
  }
  return CONFIGURED_MODELS.map(({ id, label, kind, model }) => {
    let available = true;
    if (!isDemoMode && relayAccessible !== null) {
      available = relayAccessible.includes(String(model).toLowerCase());
    }
    return { id, label, kind, model, available };
  });
}

function resolveModel(modelId) {
  const m = CONFIGURED_MODELS.find((x) => x.id === modelId) || CONFIGURED_MODELS[0];
  if (!m) {
    const err = new Error('未配置任何 AI 模型，请检查 .env 中的 API Key');
    err.code = 'NO_MODEL';
    err.status = 500;
    throw err;
  }
  const meta = getModels().find((x) => x.id === m.id);
  if (meta && !meta.available) {
    const err = new Error('所选模型当前不可用，请确认中转站已开通该模型后重启服务');
    err.code = 'MODEL_UNAVAILABLE';
    err.status = 400;
    throw err;
  }
  return m;
}

/* ===================== 工具函数 ===================== */

function splitDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/[^;,]+);base64,(.*)$/s);
  if (!match) {
    const err = new Error('图片格式无效，请上传 JPG / PNG 图片');
    err.code = 'IMAGE_DECODE';
    throw err;
  }
  return { mimeType: match[1].toLowerCase(), base64: match[2] };
}

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(splitDataUrl(dataUrl).base64, 'base64');
}

function dataUrlToPng(dataUrl) {
  const buf = dataUrlToBuffer(dataUrl);
  const { mimeType } = splitDataUrl(dataUrl);
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    const raw = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
    const png = new PNG({ width: raw.width, height: raw.height });
    png.data = Buffer.from(raw.data);
    return png;
  }
  return PNG.sync.read(buf);
}

function bufferToPngDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * 组装发给 AI 的指令。
 * Gemini 3.x / GPT Image 都是对话式/编辑式模型，不暴露 denoising_strength 参数，
 * 因此把「裸石照片 / 手绘图」的语义映射进提示词：
 *   照片（denoising 0.5）→ 忠实保留裸石形状，围绕它设计
 *   手绘图（denoising 0.78）→ 把草图转化成逼真珠宝摄影
 */
function buildInstruction({ prompt, negativePrompt, denoisingStrength }) {
  const strength = Number(denoisingStrength) || 0.5;
  const sourceHint =
    strength >= 0.7
      ? 'This is a rough hand-drawn jewelry sketch. Transform it into a realistic, polished high-end jewelry photograph while preserving the overall design concept and gemstone placement.'
      : 'This is a photo of a loose gemstone or unfinished jewelry. Preserve the gemstone shape, cut, and color faithfully, and design a high-end jewelry setting around it.';
  let text = `${sourceHint}\n\nDesign prompt: ${prompt}`;
  if (negativePrompt && String(negativePrompt).trim()) {
    text += `\n\nAvoid: ${negativePrompt}`;
  }
  return text;
}

function makeApiError(status, rawMessage, code) {
  let message = `AI 接口返回异常 (${status})`;
  if (status === 401 || status === 403) {
    message = 'API Key 无效、余额不足或没有该模型的访问权限，请检查中转站账户与模型开通状态';
  } else if (status === 404) {
    message = '模型不存在或未开通，请检查模型名配置';
  } else if (status === 429) {
    message = '请求过于频繁或账户余额不足，请稍后再试';
  } else if (status >= 500) {
    message = 'AI 服务暂时不可用，请稍后再试';
  }
  const err = new Error(status < 500 && rawMessage ? `${message}: ${rawMessage}` : message);
  err.code = code;
  err.status = status;
  return err;
}

async function postJson(url, body, headers, timeoutMs = GENERATE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('AI 生成超时，请稍后重试');
      e.code = 'TIMEOUT';
      throw e;
    }
    const e = new Error(`无法连接 AI 服务：${err.message}`);
    e.code = 'NETWORK';
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch (e) {
    return {};
  }
}

function pickImageFromData(data, providerLabel) {
  const items = (data.data || []).filter(Boolean);
  const item = items[0];
  if (!item) {
    const err = new Error(`${providerLabel} 未返回图片`);
    err.code = 'NO_IMAGE';
    throw err;
  }
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  const err = new Error(`${providerLabel} 返回结果格式无法识别`);
  err.code = 'NO_IMAGE';
  throw err;
}

/* ===================== Gemini 原生 generateContent ===================== */

async function geminiGenerate({ imageDataUrl, instruction, modelName, baseUrl, apiKey, ratio }) {
  const { mimeType, base64 } = splitDataUrl(imageDataUrl);
  const generationConfig = {
    maxOutputTokens: 8192,
    responseModalities: ['TEXT', 'IMAGE'],
  };
  if (GEMINI_IMAGE_CONFIG) Object.assign(generationConfig, GEMINI_IMAGE_CONFIG);
  // 1:1 是模型默认输出，不额外传参；其他比例通过 imageConfig 指定
  if (ratio && ratio !== '1:1') {
    generationConfig.imageConfig = {
      ...(generationConfig.imageConfig || {}),
      aspectRatio: ratio,
    };
  }

  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await postJson(
    url,
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: instruction }, { inlineData: { mimeType, data: base64 } }],
        },
      ],
      generationConfig,
    },
    {}
  );
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const raw = (data.error && data.error.message) || JSON.stringify(data);
    throw makeApiError(res.status, raw, 'GEMINI_ERROR');
  }

  const parts =
    (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts) ||
    [];
  const inline = parts.find((p) => p.inlineData && p.inlineData.data);
  if (!inline) {
    const err = new Error('Gemini 未返回图片，请确认中转站已开通该模型');
    err.code = 'GEMINI_NO_IMAGE';
    throw err;
  }
  const outMime = inline.inlineData.mimeType || 'image/jpeg';
  return `data:${outMime};base64,${inline.inlineData.data}`;
}

/* ===================== GPT Image（OpenAI 兼容 images/generations）===================== */

async function gptImageGenerate({ imageDataUrl, instruction, model, ratio }) {
  const { base64 } = splitDataUrl(imageDataUrl);
  const imageParam =
    GPT_IMAGE_IMAGE_FIELD === 'image_urls'
      ? { image_urls: [base64] }
      : { image: base64 };
  const body = {
    model: model.model,
    prompt: instruction,
    n: 1,
    size: RATIO_SIZES[ratio] || GPT_IMAGE_SIZE,
    quality: GPT_IMAGE_QUALITY,
    style: GPT_IMAGE_STYLE,
    response_format: 'b64_json',
    ...imageParam,
    ...(GPT_IMAGE_EXTRA_BODY || {}),
  };
  const res = await postJson(
    `${model.baseUrl}/v1/images/generations`,
    body,
    { Authorization: `Bearer ${model.apiKey}` }
  );
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const raw = (data.error && data.error.message) || JSON.stringify(data);
    throw makeApiError(res.status, raw, 'GPT_IMAGE_ERROR');
  }
  return pickImageFromData(data, 'GPT Image');
}

/* ===================== 旧通道：AIMLAPI / OpenAI 兼容 ===================== */

async function aimlapiGenerate({ imageDataUrl, instruction }) {
  const { base64 } = splitDataUrl(imageDataUrl);
  const res = await postJson(
    `${AIMLAPI_BASE_URL}/v1/images/generations`,
    {
      model: AIMLAPI_MODEL,
      prompt: instruction,
      image_urls: [base64],
      aspect_ratio: AIMLAPI_ASPECT_RATIO,
      resolution: AIMLAPI_RESOLUTION,
      num_images: 1,
    },
    { Authorization: `Bearer ${AIMLAPI_API_KEY}` }
  );
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const raw = (data.error && data.error.message) || JSON.stringify(data);
    throw makeApiError(res.status, raw, 'AIMLAPI_ERROR');
  }
  return pickImageFromData(data, 'AIMLAPI');
}

async function openaiGenerate({ imageDataUrl, instruction }) {
  const { base64 } = splitDataUrl(imageDataUrl);
  const imageParam =
    OPENAI_IMAGE_FIELD === 'image'
      ? { image: base64 }
      : { image_urls: [base64] };
  const body = {
    model: OPENAI_MODEL,
    prompt: instruction,
    n: 1,
    response_format: 'b64_json',
    ...imageParam,
    ...(OPENAI_EXTRA_BODY || {}),
  };
  const res = await postJson(
    `${OPENAI_BASE_URL}/images/generations`,
    body,
    { Authorization: `Bearer ${OPENAI_API_KEY}` }
  );
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const raw = (data.error && data.error.message) || JSON.stringify(data);
    throw makeApiError(res.status, raw, 'OPENAI_ERROR');
  }
  return pickImageFromData(data, '中转站');
}

/* ===================== 演示模式：本地模拟生成 ===================== */

/** 简单色调处理：亮度/对比度/饱和度 + 冷暖色偏 + 极轻微暗角 */
function stylizePixels(png, variant) {
  const { data } = png;
  const warm = [1.05, 1.0, 0.94];
  const cool = [0.96, 1.0, 1.06];
  const contrast = variant === 2 ? 1.18 : variant === 0 ? 1.08 : 1.12;
  const saturation = variant === 1 ? 1.22 : variant === 3 ? 0.9 : 1.12;
  const tint = variant === 0 ? warm : variant === 1 ? cool : [1, 1, 1];

  const cx = (png.width - 1) / 2;
  const cy = (png.height - 1) / 2;
  const maxR = Math.max(cx, cy) * 1.12;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      let r = data[idx] / 255;
      let g = data[idx + 1] / 255;
      let b = data[idx + 2] / 255;

      // 对比度
      r = (r - 0.5) * contrast + 0.5;
      g = (g - 0.5) * contrast + 0.5;
      b = (b - 0.5) * contrast + 0.5;

      // 饱和度
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * saturation;
      g = lum + (g - lum) * saturation;
      b = lum + (b - lum) * saturation;

      // 色偏
      r *= tint[0];
      g *= tint[1];
      b *= tint[2];

      // 极轻微暗角（营造展厅灯光感）
      const dist = Math.hypot(x - cx, y - cy);
      const vig = Math.max(0.9, 1 - Math.pow(dist / maxR, 2) * 0.12);
      r *= vig;
      g *= vig;
      b *= vig;

      data[idx] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    }
  }
}

function ratioDims(ratio, base) {
  const parts = String(ratio || '1:1').split(':').map(Number);
  const w = parts[0] && parts[1] ? parts[0] : 1;
  const h = parts[1] || parts[0] || 1;
  if (w >= h) return { width: base, height: Math.round((base * h) / w) };
  return { width: Math.round((base * w) / h), height: base };
}

/** 把照片放到纯白背景画布中央（对应提示词中的 pure white background），支持比例 */
function placeOnWhiteCanvas(src, scale = 0.92, ratio = '1:1') {
  const pad = Math.round(Math.max(src.width, src.height) * 0.12);
  const base = Math.max(src.width, src.height) + pad * 2;
  const dims = ratioDims(ratio, base);
  const out = new PNG({ width: dims.width, height: dims.height });
  out.data.fill(255);

  const dw = Math.round(src.width * scale);
  const dh = Math.round(src.height * scale);
  const ox = Math.round((dims.width - dw) / 2);
  const oy = Math.round((dims.height - dh) / 2);

  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(src.height - 1, Math.round(y / scale));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(src.width - 1, Math.round(x / scale));
      const si = (src.width * sy + sx) << 2;
      const di = (out.width * (oy + y) + (ox + x)) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function demoGenerate(dataUrl, variant = 0, ratio = '1:1') {
  let src;
  try {
    src = dataUrlToPng(dataUrl);
  } catch (err) {
    const e = new Error('演示模式暂不支持该图片格式（HEIC），请上传 JPG 或 PNG 图片');
    e.code = 'IMAGE_DECODE';
    throw e;
  }
  const canvas = placeOnWhiteCanvas(src, 0.92, ratio);
  stylizePixels(canvas, variant);
  return bufferToPngDataUrl(PNG.sync.write(canvas));
}

/** 演示模式高清放大：2 倍最近邻放大（无损结构，仅扩大分辨率） */
function demoUpscale(dataUrl, factor = 2) {
  let src;
  try {
    src = dataUrlToPng(dataUrl);
  } catch (err) {
    const e = new Error('图片解析失败');
    e.code = 'IMAGE_DECODE';
    throw e;
  }
  const out = new PNG({ width: src.width * factor, height: src.height * factor });
  for (let y = 0; y < out.height; y += 1) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < out.width; x += 1) {
      const sx = Math.floor(x / factor);
      const si = (src.width * sy + sx) << 2;
      const di = (out.width * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return bufferToPngDataUrl(PNG.sync.write(out));
}

/* ===================== 对外接口 ===================== */

async function generateImage({ imageDataUrl, prompt, negativePrompt, denoisingStrength, variant = 0, modelId, ratio }) {
  const normRatio = normalizeRatio(ratio);
  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800)); // 模拟 API 耗时
    return demoGenerate(imageDataUrl, variant, normRatio);
  }
  const model = resolveModel(modelId);
  const instruction = buildInstruction({ prompt, negativePrompt, denoisingStrength });
  if (model.kind === 'gemini') {
    return geminiGenerate({
      imageDataUrl,
      instruction,
      modelName: model.model,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      ratio: normRatio,
    });
  }
  if (model.kind === 'gpt-image') {
    return gptImageGenerate({ imageDataUrl, instruction, model, ratio: normRatio });
  }
  if (model.kind === 'aimlapi') return aimlapiGenerate({ imageDataUrl, instruction });
  return openaiGenerate({ imageDataUrl, instruction });
}

async function upscaleImage({ imageDataUrl, prompt, negativePrompt, modelId }) {
  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 800));
    return demoUpscale(imageDataUrl, 2);
  }
  const model = resolveModel(modelId);
  const instruction = buildInstruction({
    prompt: `${prompt}, ultra high resolution, 16k, sharp details, professional studio retouching`,
    negativePrompt,
    denoisingStrength: 0.35,
  });
  if (model.kind === 'gemini') {
    return geminiGenerate({
      imageDataUrl,
      instruction,
      modelName: model.model,
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
    });
  }
  if (model.kind === 'gpt-image') {
    return gptImageGenerate({ imageDataUrl, instruction, model });
  }
  if (model.kind === 'aimlapi') return aimlapiGenerate({ imageDataUrl, instruction });
  return openaiGenerate({ imageDataUrl, instruction });
}

module.exports = {
  isDemoMode,
  provider,
  getModels,
  refreshRelayModels,
  generateImage,
  upscaleImage,
};
