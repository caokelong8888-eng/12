/**
 * 风格标签系统 + 提示词拼接逻辑
 *
 * 拼接顺序：[首饰类型] [设计风格] [金属材质] [配石描述] [用户手打文字]
 * 末尾追加固定画质词，负面提示词固定内置。
 */

const QUALITY_SUFFIX =
  'professional jewelry photography, studio lighting, pure white background, high resolution, 8k';

const NEGATIVE_PROMPT =
  'blurry, low quality, distorted, deformed, bad anatomy, watermark, text, logo, dark, messy background, cropped, frame, jpeg artifacts, overexposed';

/** 表现风格（输出渲染风格）：label 为中文展示，prompt 为追加到提示词的英文片段 */
const RENDER_STYLES = [
  { id: 'physical', label: '实物', prompt: 'realistic finished jewelry product photography, natural material texture' },
  { id: 'sketch', label: '手绘图', prompt: 'elegant hand-drawn jewelry illustration' },
  { id: 'watercolor', label: '水彩风格', prompt: 'delicate watercolor jewelry illustration style' },
  { id: 'pencil', label: '铅笔草稿风格', prompt: 'pencil sketch jewelry design draft, clean linework' },
];

/** 视图数量 */
const VIEW_MODES = [
  { id: 'single', label: '单视图', prompt: 'single view composition' },
  { id: 'double', label: '双视图', prompt: 'two views composition showing the jewelry from two angles' },
  { id: 'triple', label: '三视图', prompt: 'three views composition (front, side, top) like a design spec sheet' },
];

/** 标签组。id 为维度标识，options 中 label 为中文展示，prompt 为英文提示词片段。 */
const TAG_GROUPS = [
  {
    id: 'jewelryType',
    label: '首饰类型',
    options: [
      { id: 'ring', label: '戒指', prompt: 'ring' },
      { id: 'pendant', label: '吊坠', prompt: 'pendant' },
      { id: 'earrings', label: '耳环', prompt: 'pair of earrings' },
      { id: 'bracelet', label: '手链', prompt: 'bracelet' },
      { id: 'necklace', label: '项链', prompt: 'necklace' },
      { id: 'bangle', label: '手镯', prompt: 'bangle' },
      { id: 'brooch', label: '胸针', prompt: 'brooch' },
    ],
  },
  {
    id: 'style',
    label: '设计风格',
    options: [
      { id: 'minimal', label: '简约', prompt: 'minimalist design' },
      { id: 'vintage', label: '复古', prompt: 'vintage design' },
      { id: 'royal', label: '宫廷', prompt: 'royal palace style design' },
      { id: 'floral', label: '自然花草', prompt: 'natural floral design' },
      { id: 'geometric', label: '几何现代', prompt: 'modern geometric design' },
      { id: 'baroque', label: '巴洛克', prompt: 'baroque ornate design' },
      { id: 'chinese', label: '新中式', prompt: 'new Chinese style design' },
      { id: 'lightlux', label: '轻奢', prompt: 'light luxury design' },
      { id: 'bohemian', label: '波西米亚', prompt: 'bohemian style design' },
      { id: 'futuristic', label: '未来感', prompt: 'futuristic avant-garde design' },
      { id: 'asymmetrical', label: '不对称艺术', prompt: 'artistic asymmetrical design' },
      { id: 'serpentine', label: '缠绕蛇形', prompt: 'serpentine winding design' },
      { id: 'artdeco', label: '装饰艺术', prompt: 'Art Deco design, geometric symmetry, sharp clean lines, 1920s classic' },
      { id: 'victorian', label: '维多利亚', prompt: 'Victorian design, romantic ornate details, heart and floral motifs' },
      { id: 'minimalism', label: '极简', prompt: 'extreme minimalism, almost no ornament, just a bare metal line or a single gemstone' },
      { id: 'pastoral', label: '田园', prompt: 'rustic pastoral style, fresh and relaxed, wildflowers and foliage' },
      { id: 'industrial', label: '工业风', prompt: 'industrial style, raw metal texture, exposed structure, rivet elements' },
      { id: 'ocean', label: '海洋主题', prompt: 'ocean theme with seashells, starfish and wave curves' },
    ],
  },
  {
    id: 'metal',
    label: '金属材质',
    options: [
      { id: 'gold', label: '黄金', prompt: 'yellow gold' },
      { id: 'whitegold', label: '白金', prompt: 'white gold' },
      { id: 'rosegold', label: '玫瑰金', prompt: 'rose gold' },
      { id: 'silver', label: '银', prompt: 'sterling silver' },
      { id: 'platinum', label: '铂金', prompt: 'platinum' },
      { id: 'ancientgold', label: '古法金', prompt: 'ancient handmade gold texture' },
      { id: 'oxidized', label: '做旧银', prompt: 'oxidized vintage silver' },
      { id: 'blackgold', label: '黑金', prompt: 'black gold' },
      { id: 'titanium', label: '钛钢', prompt: 'titanium steel' },
      { id: 'tricolor', label: '三色金', prompt: 'tri-color gold (white, yellow and rose gold intertwined)' },
    ],
  },
  {
    id: 'setting',
    label: '镶嵌方式',
    options: [
      { id: 'prong', label: '爪镶', prompt: 'classic four-prong or six-prong setting' },
      { id: 'bezel', label: '包镶', prompt: 'bezel setting with metal edge fully surrounding the main stone' },
      { id: 'tension', label: '夹镶', prompt: 'tension setting with metal holding the stone, visible from the side' },
      { id: 'pave_setting', label: '密钉镶', prompt: 'pavé setting with dense tiny metal beads around the main stone' },
      { id: 'channel', label: '轨道镶', prompt: 'channel setting with gemstones lined in a metal channel' },
      { id: 'invisible', label: '隐形镶', prompt: 'invisible setting with gemstones tightly arranged, no visible metal' },
    ],
  },
  {
    id: 'stone',
    label: '配石',
    options: [
      { id: 'circle_diamonds', label: '围一圈小钻', prompt: 'surrounded by a circle of small diamonds' },
      { id: 'double_circle_diamonds', label: '围两圈小钻', prompt: 'surrounded by two circles of small diamonds' },
      { id: 'claw_diamond', label: '主钻镶爪', prompt: 'with a claw-set center diamond' },
      { id: 'pave', label: '满钻', prompt: 'pavé set with sparkling diamonds' },
      { id: 'ruby', label: '红宝石', prompt: 'with a deep red ruby center stone' },
      { id: 'sapphire', label: '蓝宝石', prompt: 'with a vivid blue sapphire center stone' },
      { id: 'emerald', label: '祖母绿', prompt: 'with an emerald green emerald center stone' },
      { id: 'jadeite', label: '翡翠', prompt: 'with a jadeite center stone' },
      { id: 'pearl', label: '珍珠', prompt: 'with a lustrous pearl accent' },
      { id: 'moonstone', label: '月光石', prompt: 'with a moonstone center stone' },
      { id: 'yellow_diamond', label: '黄钻', prompt: 'with a yellow diamond accent' },
      { id: 'pink_diamond', label: '粉钻', prompt: 'with a pink diamond accent' },
      { id: 'black_diamond', label: '黑钻', prompt: 'with a black diamond accent' },
      { id: 'gradient', label: '渐变配石', prompt: 'with gradient accent stones arranged from light to dark or large to small' },
      { id: 'none', label: '无配石', prompt: '' },
    ],
  },
  {
    id: 'atmosphere',
    label: '背景氛围',
    options: [
      { id: 'bright', label: '亮调', prompt: 'bright studio lighting, airy' },
      { id: 'dark', label: '暗调', prompt: 'dark moody lighting' },
      { id: 'natural', label: '自然光', prompt: 'soft natural daylight' },
    ],
  },
];

/** 根据选择的标签 id 生成英文提示词（按规范顺序拼接）。 */
function buildPrompt(selections = {}, freeText = '') {
  const parts = [];
  for (const group of TAG_GROUPS) {
    const selected = group.options.find((o) => o.id === selections[group.id]);
    if (selected && selected.prompt) parts.push(selected.prompt);
  }
  if (freeText && freeText.trim()) parts.push(freeText.trim());
  parts.push(QUALITY_SUFFIX);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** 生成中文标签摘要，用于历史记录展示。 */
function getTagsLabel(selections = {}) {
  const labels = [];
  for (const group of TAG_GROUPS) {
    const selected = group.options.find((o) => o.id === selections[group.id]);
    if (selected && selected.label !== '无配石') labels.push(selected.label);
  }
  return labels.join(' · ');
}

/** 裸石照片使用中等偏低重绘幅度，手绘图使用较高重绘幅度。 */
function getDenoisingStrength(uploadType) {
  return uploadType === 'drawing' ? 0.78 : 0.5;
}

module.exports = {
  TAG_GROUPS,
  QUALITY_SUFFIX,
  NEGATIVE_PROMPT,
  RENDER_STYLES,
  VIEW_MODES,
  buildPrompt,
  getTagsLabel,
  getDenoisingStrength,
};
