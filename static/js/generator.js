/**
 * QUANTUMQR PRO - GENERATOR STUDIO CONTROLLER
 * Full client-side HTML5 Canvas QR engine + Python Flask API integration.
 * Supports:
 * - Module Shapes: Rounded, Circle Dots, Classic Square, Gapped Squares
 * - Gradients: Vertical, Horizontal, Radial, Solid
 * - Center Logo Watermark: Custom upload & presets with protective badge and scale slider
 * - Margin / Quiet Zone & High-Res Size (up to 2048px)
 * - Resilient Multi-Format Export (PNG, SVG, PDF, WebP, JPEG, Clipboard, Print)
 */

const Generator = {
  activeType: 'url',
  currentQRDataUrl: null,
  currentSVG: null,
  currentRawData: '',
  debounceTimer: null,
  uploadedLogoBase64: null,
  selectedPresetLogo: null,
  cachedLogoImage: null,

  // Default Generator Settings
  settings: {
    style: 'rounded',
    color_mode: 'vertical',
    fg_color: '#6366f1',
    fg_color_2: '#06b6d4',
    bg_color: '#ffffff',
    transparent_bg: false,
    error_correction: 'H',
    size: 512,
    margin: 2,
    logo_scale: 0.22
  },

  // Preset Palettes
  palettes: {
    cyber: { fg1: '#6366f1', fg2: '#06b6d4', bg: '#ffffff', mode: 'vertical' },
    emerald: { fg1: '#059669', fg2: '#10b981', bg: '#ffffff', mode: 'horizontal' },
    sunset: { fg1: '#f43f5e', fg2: '#fb923c', bg: '#ffffff', mode: 'vertical' },
    neon_violet: { fg1: '#8b5cf6', fg2: '#ec4899', bg: '#ffffff', mode: 'radial' },
    midnight: { fg1: '#0f172a', fg2: '#334155', bg: '#ffffff', mode: 'solid' },
    gold: { fg1: '#d97706', fg2: '#f59e0b', bg: '#ffffff', mode: 'vertical' }
  },

  init() {
    this.bindTypeChips();
    this.bindInputs();
    this.bindAccordion();
    this.bindColorControls();
    this.bindPresetPalettes();
    this.bindDrawerOptions();
    this.bindErrorCorrection();
    this.bindSliders();
    this.bindLogoControls();
    this.bindExportActions();

    // Initial render
    this.updateQR();
  },

  bindTypeChips() {
    const chips = document.querySelectorAll('.type-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        SoundFX.playClick();
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const type = chip.dataset.type;
        this.activeType = type;

        // Show matching form
        document.querySelectorAll('.type-form').forEach(f => f.style.display = 'none');
        const targetForm = document.getElementById(`form-${type}`);
        if (targetForm) {
          targetForm.style.display = 'block';
        }

        this.updateQR();
      });
    });
  },

  bindInputs() {
    const formContainer = document.querySelector('.type-form-container');
    if (formContainer) {
      formContainer.addEventListener('input', () => {
        this.debounceUpdate();
      });
    }
  },

  debounceUpdate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.updateQR();
    }, 220);
  },

  bindAccordion() {
    const headers = document.querySelectorAll('.accordion-header');
    headers.forEach(header => {
      header.addEventListener('click', () => {
        const item = header.closest('.accordion-item');
        if (item) {
          item.classList.toggle('open');
          SoundFX.playClick();
        }
      });
    });
  },

  bindColorControls() {
    const fg1Input = document.getElementById('fg-color-1');
    const fg1Hex = document.getElementById('fg-hex-1');
    const fg2Input = document.getElementById('fg-color-2');
    const fg2Hex = document.getElementById('fg-hex-2');
    const bgInput = document.getElementById('bg-color');
    const bgHex = document.getElementById('bg-hex');
    const transparentCheck = document.getElementById('transparent-bg-checkbox');
    const modeSelect = document.getElementById('color-mode-select');

    const syncColor = (colorEl, hexEl, key) => {
      colorEl.addEventListener('input', () => {
        hexEl.value = colorEl.value.toUpperCase();
        this.settings[key] = colorEl.value;
        this.debounceUpdate();
      });
      hexEl.addEventListener('input', () => {
        if (/^#[0-9A-F]{6}$/i.test(hexEl.value)) {
          colorEl.value = hexEl.value;
          this.settings[key] = hexEl.value;
          this.debounceUpdate();
        }
      });
    };

    if (fg1Input && fg1Hex) syncColor(fg1Input, fg1Hex, 'fg_color');
    if (fg2Input && fg2Hex) syncColor(fg2Input, fg2Hex, 'fg_color_2');
    if (bgInput && bgHex) syncColor(bgInput, bgHex, 'bg_color');

    if (transparentCheck) {
      transparentCheck.addEventListener('change', () => {
        this.settings.transparent_bg = transparentCheck.checked;
        const stage = document.getElementById('qr-canvas-stage');
        if (stage) {
          stage.style.background = transparentCheck.checked
            ? 'repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%) 50% / 16px 16px'
            : '#ffffff';
        }
        this.updateQR();
      });
    }

    if (modeSelect) {
      modeSelect.addEventListener('change', () => {
        this.settings.color_mode = modeSelect.value;
        const fg2Group = document.getElementById('fg2-picker-group');
        if (fg2Group) {
          fg2Group.style.display = modeSelect.value === 'solid' ? 'none' : 'flex';
        }
        this.updateQR();
      });
    }
  },

  bindPresetPalettes() {
    const badges = document.querySelectorAll('.preset-badge');
    badges.forEach(badge => {
      badge.addEventListener('click', () => {
        SoundFX.playClick();
        const palKey = badge.dataset.palette;
        const pal = this.palettes[palKey];
        if (!pal) return;

        this.settings.fg_color = pal.fg1;
        this.settings.fg_color_2 = pal.fg2;
        this.settings.bg_color = pal.bg;
        this.settings.color_mode = pal.mode;

        // Sync inputs
        const fg1In = document.getElementById('fg-color-1');
        const fg1Hex = document.getElementById('fg-hex-1');
        const fg2In = document.getElementById('fg-color-2');
        const fg2Hex = document.getElementById('fg-hex-2');
        const bgIn = document.getElementById('bg-color');
        const bgHex = document.getElementById('bg-hex');
        const modeSel = document.getElementById('color-mode-select');

        if (fg1In) fg1In.value = pal.fg1;
        if (fg1Hex) fg1Hex.value = pal.fg1.toUpperCase();
        if (fg2In) fg2In.value = pal.fg2;
        if (fg2Hex) fg2Hex.value = pal.fg2.toUpperCase();
        if (bgIn) bgIn.value = pal.bg;
        if (bgHex) bgHex.value = pal.bg.toUpperCase();
        if (modeSel) modeSel.value = pal.mode;

        const fg2Group = document.getElementById('fg2-picker-group');
        if (fg2Group) {
          fg2Group.style.display = pal.mode === 'solid' ? 'none' : 'flex';
        }

        this.updateQR();
      });
    });
  },

  bindDrawerOptions() {
    const chips = document.querySelectorAll('.drawer-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        SoundFX.playClick();
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.settings.style = chip.dataset.style;
        this.updateQR();
      });
    });
  },

  bindErrorCorrection() {
    const chips = document.querySelectorAll('.ec-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        SoundFX.playClick();
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.settings.error_correction = chip.dataset.ec;
        this.updateQR();
      });
    });
  },

  bindSliders() {
    const sizeSlider = document.getElementById('size-slider');
    const sizeVal = document.getElementById('size-val');
    const marginSlider = document.getElementById('margin-slider');
    const marginVal = document.getElementById('margin-val');
    const logoScaleSlider = document.getElementById('logo-scale-slider');
    const logoScaleVal = document.getElementById('logo-scale-val');

    if (sizeSlider && sizeVal) {
      const onSizeChange = () => {
        sizeVal.textContent = `${sizeSlider.value}px`;
        this.settings.size = parseInt(sizeSlider.value, 10);
        this.debounceUpdate();
      };
      sizeSlider.addEventListener('input', onSizeChange);
      sizeSlider.addEventListener('change', onSizeChange);
    }

    if (marginSlider && marginVal) {
      const onMarginChange = () => {
        marginVal.textContent = marginSlider.value;
        this.settings.margin = parseInt(marginSlider.value, 10);
        this.debounceUpdate();
      };
      marginSlider.addEventListener('input', onMarginChange);
      marginSlider.addEventListener('change', onMarginChange);
    }

    if (logoScaleSlider && logoScaleVal) {
      const onLogoScaleChange = () => {
        logoScaleVal.textContent = `${logoScaleSlider.value}%`;
        this.settings.logo_scale = parseInt(logoScaleSlider.value, 10) / 100;
        this.debounceUpdate();
      };
      logoScaleSlider.addEventListener('input', onLogoScaleChange);
      logoScaleSlider.addEventListener('change', onLogoScaleChange);
    }
  },

  bindLogoControls() {
    const logoInput = document.getElementById('logo-upload-input');
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    const logoStatus = document.getElementById('logo-filename-status');
    const presetBtns = document.querySelectorAll('.logo-preset-btn');

    if (logoInput) {
      logoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          this.uploadedLogoBase64 = evt.target.result;
          this.selectedPresetLogo = null;
          presetBtns.forEach(b => b.classList.remove('active'));

          // Cache preloaded Image object for instant canvas rendering
          const img = new Image();
          img.onload = () => {
            this.cachedLogoImage = img;
            this.updateQR();
          };
          img.src = this.uploadedLogoBase64;

          if (logoStatus) {
            logoStatus.textContent = file.name;
            logoStatus.style.display = 'inline-block';
          }
          if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';

          showToast('Custom Logo Loaded', file.name, 'success', 2500);
        };
        reader.readAsDataURL(file);
      });
    }

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        SoundFX.playClick();
        const iconName = btn.dataset.icon;
        presetBtns.forEach(b => b.classList.remove('active'));

        if (this.selectedPresetLogo === iconName) {
          // Deselect
          this.selectedPresetLogo = null;
          this.uploadedLogoBase64 = null;
          this.cachedLogoImage = null;
          if (removeLogoBtn) removeLogoBtn.style.display = 'none';
        } else {
          btn.classList.add('active');
          this.selectedPresetLogo = iconName;
          this.uploadedLogoBase64 = this.renderPresetIconToDataUrl(btn.querySelector('svg'));
          const img = new Image();
          img.onload = () => {
            this.cachedLogoImage = img;
            this.updateQR();
          };
          img.src = this.uploadedLogoBase64;

          if (logoStatus) logoStatus.style.display = 'none';
          if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';
        }
        this.updateQR();
      });
    });

    if (removeLogoBtn) {
      removeLogoBtn.addEventListener('click', () => {
        SoundFX.playClick();
        this.uploadedLogoBase64 = null;
        this.selectedPresetLogo = null;
        this.cachedLogoImage = null;
        if (logoInput) logoInput.value = '';
        if (logoStatus) logoStatus.style.display = 'none';
        removeLogoBtn.style.display = 'none';
        presetBtns.forEach(b => b.classList.remove('active'));
        this.updateQR();
        showToast('Logo Removed', '', 'info', 2000);
      });
    }
  },

  renderPresetIconToDataUrl(svgElement) {
    if (!svgElement) return null;
    const cloned = svgElement.cloneNode(true);
    cloned.setAttribute('width', '160');
    cloned.setAttribute('height', '160');
    cloned.setAttribute('stroke', this.settings.fg_color);
    cloned.style.color = this.settings.fg_color;

    const svgXml = new XMLSerializer().serializeToString(cloned);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgXml)));
  },

  buildContentString() {
    switch (this.activeType) {
      case 'url': {
        const proto = document.getElementById('url-protocol')?.value || 'https://';
        let val = document.getElementById('input-url')?.value.trim() || 'https://quantumqr.app';
        if (!val.startsWith('http://') && !val.startsWith('https://')) {
          val = proto + val;
        }
        return val;
      }
      case 'text': {
        return document.getElementById('input-text')?.value.trim() || 'Welcome to QuantumQR Pro!';
      }
      case 'wifi': {
        const ssid = document.getElementById('wifi-ssid')?.value.trim() || 'MyNetwork';
        const pass = document.getElementById('wifi-pass')?.value || '';
        const auth = document.getElementById('wifi-auth')?.value || 'WPA';
        const hidden = document.getElementById('wifi-hidden')?.checked ? 'true' : 'false';
        return `WIFI:S:${ssid};T:${auth};P:${pass};H:${hidden};;`;
      }
      case 'vcard': {
        const fn = document.getElementById('vcard-fn')?.value.trim() || 'John Doe';
        const tel = document.getElementById('vcard-tel')?.value.trim() || '+1234567890';
        const email = document.getElementById('vcard-email')?.value.trim() || 'john@example.com';
        const org = document.getElementById('vcard-org')?.value.trim() || 'Quantum Inc';
        const title = document.getElementById('vcard-title')?.value.trim() || '';
        const url = document.getElementById('vcard-url')?.value.trim() || '';
        const adr = document.getElementById('vcard-adr')?.value.trim() || '';

        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${fn}`,
          `TEL:${tel}`,
          `EMAIL:${email}`,
          org ? `ORG:${org}` : '',
          title ? `TITLE:${title}` : '',
          url ? `URL:${url}` : '',
          adr ? `ADR;TYPE=WORK:;;${adr};;;;` : '',
          'END:VCARD'
        ].filter(Boolean).join('\n');
      }
      case 'email': {
        const to = document.getElementById('email-to')?.value.trim() || 'contact@example.com';
        const sub = encodeURIComponent(document.getElementById('email-sub')?.value.trim() || 'Hello');
        const body = encodeURIComponent(document.getElementById('email-body')?.value.trim() || '');
        return `mailto:${to}?subject=${sub}&body=${body}`;
      }
      case 'phone': {
        const tel = document.getElementById('input-phone')?.value.trim() || '+1234567890';
        return `tel:${tel}`;
      }
      case 'sms': {
        const phone = document.getElementById('sms-phone')?.value.trim() || '+1234567890';
        const msg = encodeURIComponent(document.getElementById('sms-msg')?.value.trim() || '');
        return `smsto:${phone}:${msg}`;
      }
      case 'geo': {
        const lat = document.getElementById('geo-lat')?.value.trim() || '37.7749';
        const lng = document.getElementById('geo-lng')?.value.trim() || '-122.4194';
        return `geo:${lat},${lng}`;
      }
      case 'crypto': {
        const scheme = document.getElementById('crypto-scheme')?.value || 'bitcoin';
        const addr = document.getElementById('crypto-addr')?.value.trim() || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
        const amt = document.getElementById('crypto-amt')?.value.trim();
        return amt ? `${scheme}:${addr}?amount=${amt}` : `${scheme}:${addr}`;
      }
      case 'event': {
        const summary = document.getElementById('event-title')?.value.trim() || 'Tech Summit 2026';
        const loc = document.getElementById('event-loc')?.value.trim() || '';
        const start = document.getElementById('event-start')?.value || '';
        const end = document.getElementById('event-end')?.value || '';

        const fmtDate = (dStr) => dStr ? dStr.replace(/[-:]/g, '') + '00Z' : '';

        return [
          'BEGIN:VCARD',
          'BEGIN:VEVENT',
          `SUMMARY:${summary}`,
          loc ? `LOCATION:${loc}` : '',
          start ? `DTSTART:${fmtDate(start)}` : '',
          end ? `DTEND:${fmtDate(end)}` : '',
          'END:VEVENT'
        ].filter(Boolean).join('\n');
      }
      default:
        return 'https://quantumqr.app';
    }
  },

  /**
   * High-Performance Client Canvas QR Renderer
   * Renders module shapes (rounded, circle dots, gapped, square), gradients,
   * margin quiet zones, and logo overlay directly on HTML5 Canvas.
   */
  drawClientQRCanvas(canvas, rawText, exportDimension = null) {
    if (!window.QRCode) return false;

    // Use offscreen element to calculate QR bit matrix
    const tempDiv = document.createElement('div');
    const qrModelHolder = new QRCode(tempDiv, {
      text: rawText,
      width: 256,
      height: 256,
      correctLevel: QRCode.CorrectLevel[this.settings.error_correction] || QRCode.CorrectLevel.H
    });

    const qrModel = qrModelHolder._oQRCode;
    if (!qrModel) return false;

    const moduleCount = qrModel.getModuleCount();
    const margin = Math.max(0, parseInt(this.settings.margin ?? 2, 10));
    const totalCount = moduleCount + margin * 2;

    const renderSize = exportDimension || 512;
    canvas.width = renderSize;
    canvas.height = renderSize;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Draw Background
    if (this.settings.transparent_bg) {
      ctx.clearRect(0, 0, renderSize, renderSize);
    } else {
      ctx.fillStyle = this.settings.bg_color || '#ffffff';
      ctx.fillRect(0, 0, renderSize, renderSize);
    }

    // 2. Prepare Foreground Gradient or Solid Fill
    let fgStyle = this.settings.fg_color || '#6366f1';
    if (this.settings.color_mode === 'vertical') {
      const grad = ctx.createLinearGradient(0, 0, 0, renderSize);
      grad.addColorStop(0, this.settings.fg_color);
      grad.addColorStop(1, this.settings.fg_color_2 || '#06b6d4');
      fgStyle = grad;
    } else if (this.settings.color_mode === 'horizontal') {
      const grad = ctx.createLinearGradient(0, 0, renderSize, 0);
      grad.addColorStop(0, this.settings.fg_color);
      grad.addColorStop(1, this.settings.fg_color_2 || '#06b6d4');
      fgStyle = grad;
    } else if (this.settings.color_mode === 'radial') {
      const grad = ctx.createRadialGradient(
        renderSize / 2, renderSize / 2, 10,
        renderSize / 2, renderSize / 2, renderSize * 0.72
      );
      grad.addColorStop(0, this.settings.fg_color);
      grad.addColorStop(1, this.settings.fg_color_2 || '#06b6d4');
      fgStyle = grad;
    }

    ctx.fillStyle = fgStyle;

    const cellSize = renderSize / totalCount;
    const style = this.settings.style || 'rounded';

    // Helper: Cross-Browser Rounded Rectangle Drawer
    const drawRoundRect = (x, y, w, h, r, doFill = true) => {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y + w, x, y, r);
      ctx.closePath();
      if (doFill) ctx.fill();
    };

    // 3. Render Modules
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qrModel.isDark(r, c)) {
          const x = (c + margin) * cellSize;
          const y = (r + margin) * cellSize;

          // Check if in Corner Position Finder Patterns
          const isFinder = (r < 7 && c < 7) ||
                           (r < 7 && c >= moduleCount - 7) ||
                           (r >= moduleCount - 7 && c < 7);

          if (isFinder) {
            // Keep finder patterns clean & highly readable
            drawRoundRect(x, y, cellSize + 0.3, cellSize + 0.3, cellSize * 0.25);
          } else if (style === 'circle') {
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, (cellSize / 2) * 0.88, 0, Math.PI * 2);
            ctx.fill();
          } else if (style === 'rounded') {
            drawRoundRect(x + 0.2, y + 0.2, cellSize - 0.4, cellSize - 0.4, cellSize * 0.36);
          } else if (style === 'gapped') {
            const pad = cellSize * 0.12;
            ctx.fillRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2);
          } else {
            // Classic Square
            ctx.fillRect(x, y, cellSize + 0.4, cellSize + 0.4);
          }
        }
      }
    }

    // 4. Render Logo Overlay (if present)
    if (this.cachedLogoImage) {
      const logoScale = Math.max(0.12, Math.min(0.40, parseFloat(this.settings.logo_scale) || 0.22));
      const logoDim = renderSize * logoScale;
      const badgePad = logoDim * 0.16;
      const badgeDim = logoDim + badgePad * 2;
      const badgeX = (renderSize - badgeDim) / 2;
      const badgeY = (renderSize - badgeDim) / 2;

      // Draw protective badge card behind logo
      ctx.save();
      ctx.fillStyle = this.settings.transparent_bg ? 'rgba(255, 255, 255, 0.95)' : (this.settings.bg_color || '#ffffff');
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = Math.max(4, badgeDim * 0.1);
      drawRoundRect(badgeX, badgeY, badgeDim, badgeDim, badgeDim * 0.26, true);
      ctx.restore();

      // Badge outline
      ctx.strokeStyle = this.settings.fg_color || '#6366f1';
      ctx.lineWidth = Math.max(2, badgeDim * 0.04);
      drawRoundRect(badgeX, badgeY, badgeDim, badgeDim, badgeDim * 0.26, false);
      ctx.stroke();

      // Draw logo image centered
      try {
        ctx.drawImage(this.cachedLogoImage, badgeX + badgePad, badgeY + badgePad, logoDim, logoDim);
      } catch (err) {
        console.warn("Logo draw error:", err);
      }
    }

    return true;
  },

  async updateQR() {
    const rawData = this.buildContentString();
    this.currentRawData = rawData;

    // Update meta pills
    const lengthVal = document.getElementById('meta-length-val');
    const ecVal = document.getElementById('meta-ec-val');
    if (lengthVal) lengthVal.textContent = rawData.length;
    if (ecVal) ecVal.textContent = this.settings.error_correction;

    // First: Instant, zero-latency client canvas render with all shapes, styles, and logos!
    const stage = document.getElementById('qr-canvas-stage');
    let canvas = document.getElementById('qr-live-canvas');
    if (!canvas) {
      if (stage) stage.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.id = 'qr-live-canvas';
      canvas.style.maxWidth = '100%';
      canvas.style.maxHeight = '100%';
      canvas.style.objectFit = 'contain';
      if (stage) stage.appendChild(canvas);
    }

    this.drawClientQRCanvas(canvas, rawData, 512);
    this.currentQRDataUrl = canvas.toDataURL('image/png');

    // Also attempt backend generation for high-DPI synchronization & parsed metadata
    try {
      const payload = {
        data: rawData,
        format: 'png',
        style: this.settings.style,
        color_mode: this.settings.color_mode,
        fg_color: this.settings.fg_color,
        fg_color_2: this.settings.fg_color_2,
        bg_color: this.settings.bg_color,
        transparent_bg: this.settings.transparent_bg,
        error_correction: this.settings.error_correction,
        size: Math.min(this.settings.size, 512),
        margin: this.settings.margin,
        logo_base64: this.uploadedLogoBase64,
        logo_scale: this.settings.logo_scale
      };

      const apiBase = window.API_BASE || '';
      const res = await fetch(`${apiBase}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data_url) {
          this.currentQRDataUrl = json.data_url;
          // Render backend image
          if (stage) {
            stage.innerHTML = `<img id="main-qr-preview-img" src="${json.data_url}" alt="Quantum QR Preview" style="max-width:100%; max-height:100%; object-fit:contain;" />`;
          }

          if (window.HistoryManager) {
            window.HistoryManager.addEntry({
              type: json.parsed?.type || this.activeType,
              content: rawData,
              title: json.parsed?.title || 'Generated QR',
              thumb: json.data_url,
              source: 'generated'
            });
          }
          return;
        }
      }
    } catch (e) {
      // Backend not running on this port - client canvas already rendered above flawlessly!
    }

    // Save to History from client canvas data URL
    if (window.HistoryManager && this.currentQRDataUrl) {
      window.HistoryManager.addEntry({
        type: this.activeType,
        content: rawData,
        title: 'Generated QR',
        thumb: this.currentQRDataUrl,
        source: 'generated'
      });
    }
  },

  bindExportActions() {
    // 1. High-Res PNG Download
    const btnPng = document.getElementById('btn-download-png');
    if (btnPng) {
      btnPng.addEventListener('click', () => this.downloadFormat('png'));
    }

    // 2. Vector SVG Download
    const btnSvg = document.getElementById('btn-download-svg');
    if (btnSvg) {
      btnSvg.addEventListener('click', () => this.downloadFormat('svg'));
    }

    // 3. Print-Ready PDF Download
    const btnPdf = document.getElementById('btn-download-pdf');
    if (btnPdf) {
      btnPdf.addEventListener('click', () => this.downloadFormat('pdf'));
    }

    // 4. WebP Download
    const btnWebp = document.getElementById('btn-download-webp');
    if (btnWebp) {
      btnWebp.addEventListener('click', () => this.downloadFormat('webp'));
    }

    // 5. Copy to Clipboard
    const btnCopy = document.getElementById('btn-copy-clipboard');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => this.copyImageToClipboard());
    }

    // 6. Print Dialog
    const btnPrint = document.getElementById('btn-print-qr');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => this.printQRCode());
    }
  },

  async downloadFormat(fmt) {
    SoundFX.playSuccess();
    showToast(`Generating ${fmt.toUpperCase()}...`, 'Exporting high-resolution asset', 'info', 2000);

    const payload = {
      data: this.currentRawData,
      format: fmt,
      style: this.settings.style,
      color_mode: this.settings.color_mode,
      fg_color: this.settings.fg_color,
      fg_color_2: this.settings.fg_color_2,
      bg_color: this.settings.bg_color,
      transparent_bg: this.settings.transparent_bg,
      error_correction: this.settings.error_correction,
      size: this.settings.size, // exact requested resolution
      margin: this.settings.margin,
      logo_base64: this.uploadedLogoBase64,
      logo_scale: this.settings.logo_scale
    };

    // Primary: Try Backend Generation
    try {
      const apiBase = window.API_BASE || '';
      const res = await fetch(`${apiBase}/api/generate?download=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const blob = await res.blob();
        this.triggerFileDownload(blob, `quantum_qr_${Date.now()}.${fmt}`);
        showToast(`${fmt.toUpperCase()} Downloaded!`, 'Saved to your downloads folder', 'success', 2500);
        return;
      }
    } catch (e) {
      console.warn("Backend download unavailable, falling back to client canvas export:", e);
    }

    // Fallback: Resilient High-Res Client Canvas Export (NEVER FAILS!)
    try {
      const exportCanvas = document.createElement('canvas');
      const targetDim = this.settings.size || 512;
      this.drawClientQRCanvas(exportCanvas, this.currentRawData, targetDim);

      if (fmt === 'svg') {
        // Generate SVG vector wrapper
        const svgContent = this.generateClientSVG(exportCanvas.toDataURL('image/png'), targetDim);
        const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
        this.triggerFileDownload(svgBlob, `quantum_qr_${Date.now()}.svg`);
      } else {
        const mime = fmt === 'webp' ? 'image/webp' : (fmt === 'jpg' || fmt === 'jpeg' ? 'image/jpeg' : 'image/png');
        exportCanvas.toBlob((blob) => {
          if (blob) {
            this.triggerFileDownload(blob, `quantum_qr_${Date.now()}.${fmt === 'jpg' ? 'jpg' : (fmt === 'webp' ? 'webp' : 'png')}`);
            showToast(`${fmt.toUpperCase()} Downloaded!`, 'High-resolution export complete', 'success', 2500);
          }
        }, mime, 0.95);
      }
    } catch (clientErr) {
      showToast('Export Error', clientErr.message, 'error', 3000);
    }
  },

  triggerFileDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);
  },

  generateClientSVG(pngDataUrl, size) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <image width="${size}" height="${size}" xlink:href="${pngDataUrl}"/>
</svg>`;
  },

  async copyImageToClipboard() {
    SoundFX.playClick();
    if (!this.currentQRDataUrl) {
      showToast('Error', 'No QR code generated yet', 'error');
      return;
    }

    try {
      const res = await fetch(this.currentQRDataUrl);
      const blob = await res.blob();

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        SoundFX.playSuccess();
        showToast('Copied to Clipboard!', 'You can now paste (Ctrl+V) directly anywhere', 'success', 2500);
      } else {
        throw new Error('Clipboard API not supported');
      }
    } catch (e) {
      navigator.clipboard.writeText(this.currentRawData);
      showToast('Copied Raw Content', this.currentRawData, 'info', 2500);
    }
  },

  printQRCode() {
    SoundFX.playClick();
    const printWin = window.open('', '_blank', 'width=600,height=700');
    if (!printWin) {
      showToast('Popup Blocked', 'Please allow popups to print', 'error');
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print QuantumQR</title>
          <style>
            body {
              font-family: 'Inter', sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              margin: 0;
              text-align: center;
            }
            img { max-width: 400px; height: auto; border: 1px solid #ddd; padding: 12px; border-radius: 12px; }
            h2 { margin-bottom: 4px; font-family: sans-serif; }
            p { color: #666; font-size: 14px; max-width: 400px; word-break: break-all; }
          </style>
        </head>
        <body>
          <h2>QuantumQR Code</h2>
          <img src="${this.currentQRDataUrl}" />
          <p>${this.currentRawData}</p>
          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  },

  loadData(text, type = 'text') {
    switchTab('generator');
    const chip = document.querySelector(`.type-chip[data-type="${type}"]`);
    if (chip) {
      chip.click();
    } else {
      const textChip = document.querySelector(`.type-chip[data-type="text"]`);
      if (textChip) textChip.click();
    }

    if (type === 'url') {
      const urlInput = document.getElementById('input-url');
      if (urlInput) urlInput.value = text;
    } else {
      const textInput = document.getElementById('input-text');
      if (textInput) textInput.value = text;
    }

    this.updateQR();
    showToast('Loaded into Studio', 'You can now customize and export this QR code', 'success', 2500);
  }
};

window.Generator = Generator;
document.addEventListener('DOMContentLoaded', () => {
  Generator.init();
});
