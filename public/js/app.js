/* ============================================================
   AI珠宝设计生成器 - 前端逻辑
   功能：上传垫图、标签选择、提示词拼接预览、生成/批量生成、
   加载状态、结果展示、下载、高清放大、本地历史、登录积分购买
   ============================================================ */

(() => {
  'use strict';

  /* ==================== 状态 ==================== */

  const state = {
    token: localStorage.getItem('token') || '',
    user: null,
    credits: 0,
    demoMode: false,
    signupBonus: 3,
    tagGroups: [],
    models: [],
    model: '',
    ratios: [],
    ratio: '1:1',
    renderStyles: [],
    renderStyle: 'physical',
    viewModes: [],
    views: 'single',
    packages: [],
    negativePrompt: '',
    uploadType: 'photo',
    currentImage: null,
    currentImageName: '',
    coinReference: false,
    selections: {},
    lastGenerate: null, // 用于失败后重试
  };

  const QUALITY_SUFFIX =
    'professional jewelry photography, studio lighting, pure white background, high resolution, 8k';

  /* ==================== DOM ==================== */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    topbarRight: $('#topbarRight'),
    demoBanner: $('#demoBanner'),
    heroPlaceholder: $('#heroPlaceholder'),
    heroImages: $('#heroImages'),
    resultStage: $('#resultStage'),
    resultPlaceholder: $('#resultPlaceholder'),
    uploadTypeSeg: $('#uploadTypeSeg'),
    uploadTip: $('#uploadTip'),
    coinRef: $('#coinRef'),
    coinHint: $('#coinHint'),
    dropzone: $('#dropzone'),
    fileInput: $('#fileInput'),
    dzEmpty: $('#dzEmpty'),
    dzFilled: $('#dzFilled'),
    dzTitle: $('#dzTitle'),
    dzThumb: $('#dzThumb'),
    dzName: $('#dzName'),
    dzReplace: $('#dzReplace'),
    tagGroups: $('#tagGroups'),
    modelRow: $('#modelRow'),
    modelNote: $('#modelNote'),
    ratioRow: $('#ratioRow'),
    styleRow: $('#styleRow'),
    viewRow: $('#viewRow'),
    freeText: $('#freeText'),
    generateBtn: $('#generateBtn'),
    generate2Btn: $('#generate2Btn'),
    batchBtn: $('#batchBtn'),
    viewer: $('#viewer'),
    viewerImg: $('#viewerImg'),
    viewerDownload: $('#viewerDownload'),
    viewerUpscale: $('#viewerUpscale'),
    viewerClose: $('#viewerClose'),
    promptPreview: $('#promptPreview'),
    errorBar: $('#errorBar'),
    errorBarText: $('#errorBarText'),
    errorRetryBtn: $('#errorRetryBtn'),
    historyGrid: $('#historyGrid'),
    historyEmpty: $('#historyEmpty'),
    clearHistory: $('#clearHistory'),
    loadingMask: $('#loadingMask'),
    authModal: $('#authModal'),
    authTabs: $('#authTabs'),
    authForm: $('#authForm'),
    authPhone: $('#authPhone'),
    authNickname: $('#authNickname'),
    nicknameField: $('#nicknameField'),
    authPassword: $('#authPassword'),
    authSubmit: $('#authSubmit'),
    authNote: $('#authNote'),
    wechatBtn: $('#wechatBtn'),
    purchaseModal: $('#purchaseModal'),
    purchaseBalance: $('#purchaseBalance'),
    pkgList: $('#pkgList'),
    toastWrap: $('#toastWrap'),
  };

  /* ==================== 通用工具 ==================== */

  function toast(message, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    els.toastWrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, 2600);
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function api(path, method = 'GET', body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const e = new Error('网络连接异常，请检查网络后重试');
      e.network = true;
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || '请求失败，请稍后重试');
      e.status = res.status;
      e.code = data.code;
      throw e;
    }
    return data;
  }

  /* ==================== 初始化：加载配置 ==================== */

  async function loadConfig() {
    try {
      const cfg = await api('/api/config');
      state.demoMode = !!cfg.demoMode;
      state.signupBonus = cfg.signupBonus || 3;
      state.tagGroups = cfg.tagGroups || [];
      state.models = cfg.models || [];
      state.model = '';
      state.ratios = cfg.ratios || [];
      state.renderStyles = cfg.renderStyles || [];
      state.viewModes = cfg.viewModes || [];
      state.packages = cfg.packages || [];
      state.negativePrompt = cfg.negativePrompt || '';
      renderTagGroups();
      renderModelRow();
      renderRatioRow();
      renderStyleRow();
      renderViewRow();
      renderPackages();
      if (state.demoMode) els.demoBanner.hidden = false;
      els.authNote.textContent = `新用户注册即送 ${state.signupBonus} 次免费生成额度`;
    } catch (err) {
      toast('配置加载失败：' + err.message, 'error');
    }
  }

  /* ==================== 顶部导航 / 会话 ==================== */

  function renderTopbar() {
    if (!state.token || !state.user) {
      els.topbarRight.innerHTML = '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'login-btn';
      btn.textContent = '登录';
      btn.addEventListener('click', openAuthModal);
      els.topbarRight.appendChild(btn);
      return;
    }

    els.topbarRight.innerHTML = '';
    const chip = document.createElement('span');
    chip.className = 'credits-chip';
    chip.innerHTML = `<span class="bolt">⚡</span><span id="creditsNum">${state.credits}</span> 积分`;

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    const name = state.user.nickname || state.user.phone || '用';
    avatar.textContent = name.slice(0, 1).toUpperCase();
    avatar.title = name;

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'text-btn';
    logout.textContent = '退出';
    logout.addEventListener('click', () => {
      state.token = '';
      state.user = null;
      state.credits = 0;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      renderTopbar();
      toast('已退出登录');
    });

    els.topbarRight.append(chip, avatar, logout);
  }

  function updateCredits(n) {
    state.credits = Number(n);
    const num = document.getElementById('creditsNum');
    if (num) num.textContent = state.credits;
    els.purchaseBalance.textContent = state.credits;
  }

  async function refreshCredits() {
    if (!state.token) return;
    try {
      const data = await api('/api/user/credits');
      state.user = data.user;
      updateCredits(data.credits);
    } catch (err) {
      if (err.status === 401) {
        state.token = '';
        localStorage.removeItem('token');
        renderTopbar();
      }
    }
  }

  function restoreSession() {
    const saved = localStorage.getItem('user');
    if (state.token && saved) {
      try {
        state.user = JSON.parse(saved);
        renderTopbar();
        refreshCredits();
      } catch (err) {
        state.user = null;
      }
    } else {
      renderTopbar();
    }
  }

  /* ==================== 上传 ==================== */

  els.uploadTypeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.uploadType = btn.dataset.type;
    $$('.seg-btn', els.uploadTypeSeg).forEach((b) => b.classList.toggle('active', b === btn));
    els.dzTitle.textContent = state.uploadType === 'drawing' ? '点击上传手绘图' : '点击上传裸石照片';
    els.uploadTip.textContent =
      state.uploadType === 'drawing'
        ? '手绘图将直接作为垫图，AI 会以较高重绘幅度将其转化为实物效果'
        : '照片将直接作为垫图，不进行抠图处理，AI 会尽量保持裸石原貌';
  });

  els.coinRef.addEventListener('change', () => {
    state.coinReference = els.coinRef.checked;
    els.coinHint.hidden = !els.coinRef.checked;
  });

  els.dropzone.addEventListener('click', () => els.fileInput.click());
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      els.fileInput.click();
    }
  });
  els.fileInput.addEventListener('change', () => {
    handleFile(els.fileInput.files[0]);
    els.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove('dragover');
    })
  );
  els.dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  els.dzReplace.addEventListener('click', (e) => {
    e.stopPropagation();
    els.fileInput.click();
  });

  function handleFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|heic|heif|webp)/i.test(file.type)) {
      toast('图片格式不支持，请上传 JPG / PNG / HEIC', 'error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast('图片过大（超过 25MB），请重新选择', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.currentImage = reader.result;
      state.currentImageName = file.name;
      clearResultStage();
      els.dzEmpty.hidden = true;
      els.dzFilled.hidden = false;
      els.dzThumb.src = state.currentImage;
      els.dzName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB`;
      renderHero([state.currentImage], '垫图预览');
      hideError();
      toast('图片上传成功');
    };
    reader.onerror = () => toast('图片上传失败，请重新选择', 'error');
    reader.readAsDataURL(file);
  }

  /* ==================== 主视觉区 ==================== */

  function renderHero(images, label) {
    if (!images || images.length === 0) {
      els.heroImages.hidden = true;
      els.heroImages.innerHTML = '';
      els.heroPlaceholder.hidden = false;
      return;
    }
    els.heroPlaceholder.hidden = true;
    els.heroImages.hidden = false;
    els.heroImages.innerHTML = '';
    els.heroImages.style.gridTemplateColumns = '1fr';
    images.forEach((src) => {
      const img = document.createElement('img');
      img.className = 'hero-img';
      img.src = src;
      img.alt = '垫图预览';
      els.heroImages.appendChild(img);
    });
  }

  /* ==================== 生成结果区（与垫图预览左右分布）==================== */

  function renderResultStage(images, label) {
    els.resultPlaceholder.hidden = true;
    els.resultStage.querySelectorAll('img, .result-stage-note').forEach((el) => el.remove());
    els.resultStage.classList.toggle('grid-2', images.length >= 2);
    images.forEach((src) => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '生成结果';
      img.addEventListener('click', () => openViewer(img.src));
      els.resultStage.appendChild(img);
    });
    if (label) {
      const note = document.createElement('p');
      note.className = 'result-stage-note';
      note.textContent = label;
      els.resultStage.appendChild(note);
    }
  }

  function clearResultStage() {
    els.resultStage.querySelectorAll('img, .result-stage-note').forEach((el) => el.remove());
    els.resultStage.classList.remove('grid-2');
    els.resultPlaceholder.hidden = false;
  }

  /* ==================== 风格标签 ==================== */

  function renderTagGroups() {
    els.tagGroups.innerHTML = '';
    state.tagGroups.forEach((group) => {
      const wrap = document.createElement('div');
      wrap.className = 'tag-group';

      const label = document.createElement('p');
      label.className = 'tag-group-label';
      label.textContent = group.label;

      const row = document.createElement('div');
      row.className = 'tag-row';
      group.options.forEach((opt) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip';
        chip.dataset.group = group.id;
        chip.dataset.opt = opt.id;
        chip.textContent = opt.label;
        chip.addEventListener('click', () => toggleTag(group.id, opt.id, chip));
        row.appendChild(chip);
      });

      wrap.append(label, row);
      els.tagGroups.appendChild(wrap);
    });
  }

  function toggleTag(groupId, optId, chip) {
    if (state.selections[groupId] === optId) {
      delete state.selections[groupId];
      chip.classList.remove('selected');
    } else {
      state.selections[groupId] = optId;
      $$('.tag-chip', chip.parentElement).forEach((c) => c.classList.toggle('selected', c.dataset.opt === optId));
    }
    updatePromptPreview();
  }

  /* ==================== 生成模型选择 ==================== */

  function renderModelRow() {
    els.modelRow.innerHTML = '';
    if (!state.models.length) {
      const tip = document.createElement('p');
      tip.className = 'model-note';
      tip.textContent = '暂无可用的生成模型';
      els.modelRow.appendChild(tip);
      return;
    }
    state.models.forEach((m) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.dataset.model = m.id;
      chip.textContent = m.label;
      chip.disabled = !m.available;
      chip.title = m.available ? m.model : '尚未开通，请在中转站开通后重启服务';
      if (m.available && !state.model) state.model = m.id;
      chip.addEventListener('click', () => {
        state.model = m.id;
        $$('.tag-chip', els.modelRow).forEach((c) =>
          c.classList.toggle('selected', c.dataset.model === m.id)
        );
        updateModelNote();
      });
      els.modelRow.appendChild(chip);
    });
    const cur = els.modelRow.querySelector(`[data-model="${state.model}"]`);
    if (cur) cur.classList.add('selected');
    updateModelNote();
  }

  function updateModelNote() {
    const m = state.models.find((x) => x.id === state.model);
    if (!m) {
      els.modelNote.textContent = '暂无可用的生成模型';
      return;
    }
    els.modelNote.textContent = m.available
      ? `当前模型：${m.label}`
      : `${m.label} 尚未开通，请在中转站开通后重启服务`;
  }

  /* ==================== 图片比例选择 ==================== */

  function renderRatioRow() {
    els.ratioRow.innerHTML = '';
    state.ratios.forEach((r) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.dataset.ratio = r.id;
      chip.textContent = r.label;
      if (r.id === state.ratio) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        state.ratio = r.id;
        $$('.tag-chip', els.ratioRow).forEach((c) =>
          c.classList.toggle('selected', c.dataset.ratio === r.id)
        );
      });
      els.ratioRow.appendChild(chip);
    });
  }

  function renderStyleRow() {
    els.styleRow.innerHTML = '';
    state.renderStyles.forEach((s) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.dataset.style = s.id;
      chip.textContent = s.label;
      if (s.id === state.renderStyle) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        state.renderStyle = s.id;
        $$('.tag-chip', els.styleRow).forEach((c) =>
          c.classList.toggle('selected', c.dataset.style === s.id)
        );
        updatePromptPreview();
      });
      els.styleRow.appendChild(chip);
    });
  }

  function renderViewRow() {
    els.viewRow.innerHTML = '';
    state.viewModes.forEach((v) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.dataset.views = v.id;
      chip.textContent = v.label;
      if (v.id === state.views) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        state.views = v.id;
        $$('.tag-chip', els.viewRow).forEach((c) =>
          c.classList.toggle('selected', c.dataset.views === v.id)
        );
        updatePromptPreview();
      });
      els.viewRow.appendChild(chip);
    });
  }

  function getTagsLabel() {
    const labels = [];
    state.tagGroups.forEach((group) => {
      const sel = state.selections[group.id];
      const opt = sel && group.options.find((o) => o.id === sel);
      if (opt && opt.label !== '无配石') labels.push(opt.label);
    });
    return labels.join(' · ');
  }

  function buildPromptPreview() {
    const parts = [];
    state.tagGroups.forEach((group) => {
      const sel = state.selections[group.id];
      const opt = sel && group.options.find((o) => o.id === sel);
      if (opt && opt.prompt) parts.push(opt.prompt);
    });
    const freeText = els.freeText.value.trim();
    if (freeText) parts.push(freeText);
    const styleSel = state.renderStyles.find((s) => s.id === state.renderStyle);
    const viewSel = state.viewModes.find((v) => v.id === state.views);
    if (styleSel && styleSel.prompt && state.renderStyle !== 'physical') parts.push(styleSel.prompt);
    if (viewSel && viewSel.prompt && state.views !== 'single') parts.push(viewSel.prompt);
    parts.push(QUALITY_SUFFIX);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function updatePromptPreview() {
    const preview = buildPromptPreview();
    els.promptPreview.textContent = preview || '选择标签后，此处显示将发送给 AI 的提示词';
  }

  els.freeText.addEventListener('input', updatePromptPreview);

  /* ==================== 生成 ==================== */

  function showError(text, retryable = true) {
    els.errorBarText.textContent = text;
    els.errorRetryBtn.hidden = !retryable;
    els.errorBar.hidden = false;
  }

  function hideError() {
    els.errorBar.hidden = true;
  }

  function setLoading(on) {
    els.loadingMask.hidden = !on;
    els.generateBtn.disabled = on;
    els.generate2Btn.disabled = on;
    els.batchBtn.disabled = on;
  }

  async function generate(count) {
    if (!state.token || !state.user) {
      toast('请先登录后使用生成功能');
      openAuthModal();
      return;
    }
    if (!state.currentImage) {
      toast('请先上传裸石照片或手绘图', 'error');
      return;
    }

    const payload = {
      image: state.currentImage,
      uploadType: state.uploadType,
      tags: state.selections,
      freeText: els.freeText.value.trim(),
      count,
      model: state.model || undefined,
      ratio: state.ratio,
      style: state.renderStyle,
      views: state.views,
      coinReference: state.coinReference,
    };
    state.lastGenerate = payload;
    hideError();
    setLoading(true);

    try {
      const res = await api('/api/generate', 'POST', payload);
      const images = res.results.map((r) => r.image);
      const modelLabel = (state.models.find((m) => m.id === res.model) || {}).label || '';
      renderResultStage(images, `生成 ${count} 张 · 消耗 ${count} 积分${modelLabel ? ` · ${modelLabel}` : ''}`);
      updateCredits(res.creditsLeft);
      await saveHistory(res);
      renderHistory();
      els.promptPreview.textContent = res.prompt || buildPromptPreview();
      toast(`生成成功${res.demoMode ? '（演示模式）' : ''}`);
      hideError();
    } catch (err) {
      handleError(err, `生成失败，请稍后重试`, true);
    } finally {
      setLoading(false);
    }
  }

  function handleError(err, fallbackText, retryable) {
    if (err.network) {
      toast('网络连接异常，请检查网络后重试', 'error');
      showError('网络连接异常，请检查网络后重试', retryable);
    } else if (err.status === 402) {
      toast('积分不足，请先购买积分', 'error');
      openPurchaseModal();
    } else if (err.status === 401) {
      toast('登录状态已失效，请重新登录', 'error');
      openAuthModal();
    } else {
      toast(err.message || fallbackText, 'error');
      showError(err.message || fallbackText, retryable);
    }
  }

  els.generateBtn.addEventListener('click', () => generate(1));
  els.generate2Btn.addEventListener('click', () => generate(2));
  els.batchBtn.addEventListener('click', () => generate(4));
  els.errorRetryBtn.addEventListener('click', () => {
    if (state.lastGenerate) generate(state.lastGenerate.count);
  });

  /* ==================== 下载 / 高清放大 ==================== */

  async function downloadImage(src, name = `jewelry-design-${Date.now()}.png`) {
    try {
      if (src.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = src;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      toast('下载失败，请稍后重试', 'error');
    }
  }

  async function upscaleImage(imgEl, src, itemId, modelId) {
    if (!state.token || !state.user) {
      toast('请先登录后使用生成功能');
      openAuthModal();
      return;
    }
    setLoading(true);
    try {
      const res = await api('/api/generate/upscale', 'POST', {
        image: src,
        prompt: '',
        model: modelId || state.model || undefined,
      });
      imgEl.src = res.image;
      updateCredits(res.creditsLeft);
      if (itemId) await updateHistoryImage(itemId, res.image);
      toast(`高清放大完成${res.demoMode ? '（演示模式）' : ''}`);
    } catch (err) {
      handleError(err, '高清放大失败，请稍后重试', false);
    } finally {
      setLoading(false);
    }
  }

  /* ==================== 高清大图查看器 ==================== */

  const viewerState = { src: '', item: null };

  function openViewer(src, item) {
    viewerState.src = src;
    viewerState.item = item || null;
    els.viewerImg.src = src;
    els.viewer.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeViewer() {
    els.viewer.hidden = true;
    document.body.style.overflow = '';
    viewerState.src = '';
    viewerState.item = null;
  }

  els.viewerClose.addEventListener('click', closeViewer);
  els.viewer.addEventListener('click', (e) => {
    if (e.target === els.viewer) closeViewer();
  });
  els.viewerDownload.addEventListener('click', () => {
    if (viewerState.src) downloadImage(viewerState.src);
  });
  els.viewerUpscale.addEventListener('click', async () => {
    if (!viewerState.src) return;
    await upscaleImage(
      els.viewerImg,
      viewerState.src,
      viewerState.item ? viewerState.item.id : null,
      viewerState.item ? viewerState.item.model : ''
    );
  });

  /* ==================== 本地历史（IndexedDB） ==================== */

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('jewelry-history', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function saveHistory(res) {
    const db = await openDB();
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    const now = new Date().toISOString();
    res.results.forEach((r, i) => {
      store.put({
        id: r.id,
        image: r.image,
        tagsLabel: res.tagsLabel || getTagsLabel(),
        model: res.model || state.model || '',
        createdAt: now,
        order: Date.now() + i,
      });
    });
    await txDone(tx);

    // 最多保留 20 条，超出删除最旧记录
    const all = await loadHistory();
    if (all.length > 20) {
      const drop = all.slice(20).map((x) => x.id);
      const tx2 = db.transaction('items', 'readwrite');
      drop.forEach((id) => tx2.objectStore('items').delete(id));
      await txDone(tx2);
    }
    db.close();
  }

  async function loadHistory() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('items', 'readonly').objectStore('items').getAll();
      req.onsuccess = () => {
        const items = req.result.sort((a, b) => (b.order || 0) - (a.order || 0));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  }

  async function updateHistoryImage(id, image) {
    const db = await openDB();
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    const item = await new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (item) {
      item.image = image;
      store.put(item);
    }
    await txDone(tx);
    db.close();
  }

  async function clearHistory() {
    const db = await openDB();
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').clear();
    await txDone(tx);
    db.close();
    renderHistory();
    toast('历史记录已清空');
  }

  async function renderHistory() {
    let items = [];
    try {
      items = await loadHistory();
    } catch (err) {
      toast('读取本地历史失败', 'error');
    }
    els.historyGrid.innerHTML = '';
    els.historyEmpty.hidden = items.length > 0;
    els.clearHistory.hidden = items.length === 0;
    els.historyGrid.classList.toggle('grid-2', false);

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'result-card';

      const img = document.createElement('img');
      img.src = item.image;
      img.alt = '设计效果图';
      img.loading = 'lazy';
      img.addEventListener('click', () => openViewer(item.image, { id: item.id, model: item.model }));

      const meta = document.createElement('div');
      meta.className = 'result-meta';

      if (item.model) {
        const modelBadge = document.createElement('span');
        modelBadge.className = 'result-model';
        const m = state.models.find((x) => x.id === item.model);
        modelBadge.textContent = m ? m.label : item.model;
        meta.appendChild(modelBadge);
      }

      const tags = document.createElement('p');
      tags.className = 'result-tags';
      tags.textContent = item.tagsLabel || '未选择标签';

      const time = document.createElement('p');
      time.className = 'result-time';
      time.textContent = fmtTime(item.createdAt);

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'btn btn-primary btn-sm';
      dl.textContent = '下载原图';
      dl.addEventListener('click', () => downloadImage(item.image, `jewelry-${item.id}.png`));

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'btn btn-ghost btn-sm';
      up.textContent = '高清放大 +1积分';
      up.addEventListener('click', () => upscaleImage(img, item.image, item.id, item.model));

      actions.append(dl, up);
      meta.append(tags, time, actions);
      card.append(img, meta);
      els.historyGrid.appendChild(card);
    });
  }

  els.clearHistory.addEventListener('click', clearHistory);

  /* ==================== 登录 / 注册 ==================== */

  function openModal(id) {
    $(`#${id}`).hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    $(`#${id}`).hidden = true;
    document.body.style.overflow = '';
  }

  function openAuthModal() {
    switchAuthTab('login');
    openModal('authModal');
  }

  function openPurchaseModal() {
    els.purchaseBalance.textContent = state.credits;
    openModal('purchaseModal');
  }

  $$('.modal-close').forEach((btn) =>
    btn.addEventListener('click', () => closeModal(btn.dataset.close))
  );
  $$('.modal-backdrop').forEach((backdrop) =>
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    })
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('authModal');
      closeModal('purchaseModal');
      closeViewer();
    }
  });

  function switchAuthTab(tab) {
    $$('.seg-btn', els.authTabs).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    els.nicknameField.hidden = tab !== 'register';
    els.authSubmit.textContent = tab === 'register' ? '注册并登录' : '登录';
    els.authForm.dataset.tab = tab;
  }

  els.authTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (btn) switchAuthTab(btn.dataset.tab);
  });

  els.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = els.authPhone.value.trim();
    const password = els.authPassword.value;
    const nickname = els.authNickname.value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请输入正确的 11 位手机号', 'error');
    if (password.length < 6) return toast('密码至少 6 位', 'error');

    const isRegister = els.authForm.dataset.tab === 'register';
    const submitBtn = els.authSubmit;
    submitBtn.disabled = true;
    try {
      const data = isRegister
        ? await api('/api/register', 'POST', { phone, password, nickname })
        : await api('/api/login', 'POST', { phone, password });
      applySession(data);
      closeModal('authModal');
      toast(isRegister ? '注册成功，已赠送免费生成额度' : '登录成功');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  els.wechatBtn.addEventListener('click', async () => {
    els.wechatBtn.disabled = true;
    try {
      const data = await api('/api/login/wechat', 'POST', {
        code: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      applySession(data);
      closeModal('authModal');
      toast('微信登录成功');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      els.wechatBtn.disabled = false;
    }
  });

  function applySession(data) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    updateCredits(data.user.credits);
    renderTopbar();
  }

  /* ==================== 积分购买 ==================== */

  function renderPackages() {
    els.pkgList.innerHTML = '';
    state.packages.forEach((pkg) => {
      const item = document.createElement('div');
      item.className = `pkg-item${pkg.hot ? ' hot' : ''}`;

      const info = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'pkg-name';
      name.textContent = `${pkg.name} ${pkg.priceLabel}`;
      const desc = document.createElement('p');
      desc.className = 'pkg-desc';
      desc.textContent = `${pkg.credits} 积分${pkg.hot ? ' · 最划算' : ''}`;
      info.append(name, desc);

      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'pkg-buy';
      buy.textContent = '购买';
      buy.addEventListener('click', () => purchasePackage(pkg));

      item.append(info, buy);
      els.pkgList.appendChild(item);
    });
  }

  async function purchasePackage(pkg) {
    if (!state.token || !state.user) {
      closeModal('purchaseModal');
      toast('请先登录');
      openAuthModal();
      return;
    }
    try {
      const res = await api('/api/credits/purchase', 'POST', { packageId: pkg.id });
      updateCredits(res.credits);
      toast(`购买成功，已到账 ${pkg.credits} 积分`);
      closeModal('purchaseModal');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  /* ==================== 启动 ==================== */

  async function init() {
    await loadConfig();
    restoreSession();
    await renderHistory();
    updatePromptPreview();
  }

  init();
})();
