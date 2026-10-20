const ScannerManager = {
  videoStream: null,
  videoEl: null,
  canvasEl: null,
  canvasCtx: null,
  isScanning: false,
  scanIntervalId: null,
  activeMode: 'camera', // 'camera' or 'file'
  hasTorch: false,
  isTorchOn: false,
  lastScannedContent: '',
  cameras: [],
  currentCameraIndex: 0,

  init() {
    this.videoEl = document.getElementById('camera-video');
    this.canvasEl = document.getElementById('camera-canvas');
    if (this.canvasEl) {
      this.canvasCtx = this.canvasEl.getContext('2d', { willReadFrequently: true });
    }

    this.bindModeToggle();
    this.bindDropZone();
    this.bindCameraControls();
    this.bindGlobalPaste();
    this.bindResultActions();
    this.bindManualStartButton();
  },

  onTabActivated() {
    if (this.activeMode === 'camera') {
      this.startCamera();
    }
  },

  onTabDeactivated() {
    this.stopCamera();
  },

  bindManualStartButton() {
    const manualBtn = document.getElementById('btn-manual-start-camera');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => {
        SoundFX.playClick();
        this.startCamera();
      });
    }
  },

  bindModeToggle() {
    const btns = document.querySelectorAll('.scanner-toggle-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        SoundFX.playClick();
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.dataset.mode;
        this.activeMode = mode;

        const cameraSec = document.getElementById('scanner-camera-section');
        const fileSec = document.getElementById('scanner-file-section');

        if (mode === 'camera') {
          if (cameraSec) cameraSec.style.display = 'block';
          if (fileSec) fileSec.style.display = 'none';
          this.startCamera();
        } else {
          if (cameraSec) cameraSec.style.display = 'none';
          if (fileSec) fileSec.style.display = 'block';
          this.stopCamera();
        }
      });
    });
  },

  bindCameraControls() {
    const switchCamBtn = document.getElementById('btn-switch-camera');
    const torchBtn = document.getElementById('btn-toggle-torch');
    const pauseBtn = document.getElementById('btn-pause-scanner');

    if (switchCamBtn) {
      switchCamBtn.addEventListener('click', async () => {
        SoundFX.playClick();
        try {
          if (this.cameras.length <= 1) {
            this.cameras = await this.getCameraDevices();
          }
          if (this.cameras.length > 1) {
            this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
            this.startCamera(this.cameras[this.currentCameraIndex].deviceId);
          } else {
            // Flip facing mode between user and environment
            const newFacing = this.currentFacingMode === 'user' ? 'environment' : 'user';
            this.currentFacingMode = newFacing;
            this.startCamera();
          }
        } catch (e) {
          showToast('Camera Switch Error', e.message, 'info');
        }
      });
    }

    if (torchBtn) {
      torchBtn.addEventListener('click', () => {
        SoundFX.playClick();
        this.toggleTorch();
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        SoundFX.playClick();
        const viewport = document.querySelector('.camera-viewport-card');

        // If camera stream is not running at all
        if (!this.videoStream) {
          showToast('Camera Inactive', 'Click "Turn On Camera" first to start scanning', 'info', 2500);
          return;
        }

        if (this.isScanning) {
          // Instant Pause: freezes frame analysis and video stream playback
          this.isScanning = false;
          cancelAnimationFrame(this.scanIntervalId);
          if (this.videoEl) {
            try { this.videoEl.pause(); } catch(e) {}
          }
          if (viewport) viewport.classList.add('is-paused');
          const statusPill = document.getElementById('camera-status-pill');
          if (statusPill) statusPill.textContent = 'Scanner Paused';

          pauseBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Resume
          `;
          showToast('Scanner Paused', 'Frame detection paused', 'info', 1500);
        } else {
          // Instant Resume
          if (viewport) viewport.classList.remove('is-paused');
          if (this.videoEl) {
            try { this.videoEl.play(); } catch(e) {}
          }
          this.isScanning = true;
          this.startFrameLoop();
          const statusPill = document.getElementById('camera-status-pill');
          if (statusPill) statusPill.textContent = 'Scanning Live';

          pauseBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            Pause
          `;
          showToast('Scanner Resumed', 'Live scanning active', 'info', 1500);
        }
      });
    }
  },

  async getCameraDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e) {
      return [];
    }
  },

  async startCamera(specificDeviceId = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Camera Error', 'WebRTC camera access not supported on this browser or origin', 'error');
      const startOverlay = document.getElementById('camera-start-overlay');
      if (startOverlay) startOverlay.style.display = 'flex';
      return;
    }

    this.stopCamera();

    const startOverlay = document.getElementById('camera-start-overlay');
    const statusPill = document.getElementById('camera-status-pill');

    // Multi-tier fallback constraints for maximum cross-device compatibility
    const constraintTiers = [
      specificDeviceId ? { video: { deviceId: { exact: specificDeviceId } } } : null,
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } },
      { video: { facingMode: 'user' } },
      { video: true },
      { video: { facingMode: { ideal: 'environment' } } }
    ].filter(Boolean);

    let stream = null;
    let lastError = null;

    for (const c of constraintTiers) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      console.warn("Camera access denied or failed:", lastError);
      if (startOverlay) startOverlay.style.display = 'flex';
      if (statusPill) statusPill.textContent = 'Camera Blocked';
      const errMsg = lastError?.name === 'NotAllowedError'
        ? 'Permission was blocked. Click the lock/camera icon in your address bar to allow camera access.'
        : (lastError?.name === 'NotReadableError'
            ? 'Webcam is busy in another app (like Zoom or Windows Camera). Please close it and retry.'
            : (lastError?.message || 'Unable to access video device.'));
      showToast('Camera Not Accessible', errMsg, 'error', 6000);
      return;
    }

    try {
      this.videoStream = stream;
      if (this.videoEl) {
        this.videoEl.muted = true;
        this.videoEl.playsInline = true;
        this.videoEl.setAttribute('playsinline', '');
        this.videoEl.setAttribute('muted', '');
        this.videoEl.srcObject = stream;

        this.videoEl.onloadedmetadata = async () => {
          try {
            await this.videoEl.play();
          } catch(e) {}
        };

        try {
          await this.videoEl.play();
        } catch(e) {}
      }

      this.isScanning = true;
      if (startOverlay) startOverlay.style.display = 'none';
      if (statusPill) statusPill.textContent = 'Scanning Live';

      this.checkTorchSupport(stream);
      this.startFrameLoop();
      this.cameras = await this.getCameraDevices();
    } catch (err) {
      console.warn("Video play error:", err);
      if (startOverlay) startOverlay.style.display = 'flex';
    }
  },

  stopCamera() {
    this.isScanning = false;
    cancelAnimationFrame(this.scanIntervalId);

    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => {
        try { track.stop(); } catch(e) {}
      });
      this.videoStream = null;
    }

    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }

    const viewport = document.querySelector('.camera-viewport-card');
    if (viewport) viewport.classList.remove('is-paused');

    const pauseBtn = document.getElementById('btn-pause-scanner');
    if (pauseBtn) {
      pauseBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        Pause
      `;
    }

    const startOverlay = document.getElementById('camera-start-overlay');
    if (startOverlay && this.activeMode === 'camera') {
      startOverlay.style.display = 'flex';
    }

    const statusPill = document.getElementById('camera-status-pill');
    if (statusPill) statusPill.textContent = 'Camera Ready';
  },

  checkTorchSupport(stream) {
    const track = stream.getVideoTracks()[0];
    const torchBtn = document.getElementById('btn-toggle-torch');
    if (!torchBtn) return;

    if (track && typeof track.getCapabilities === 'function') {
      const caps = track.getCapabilities();
      if (caps.torch) {
        this.hasTorch = true;
        torchBtn.style.display = 'inline-flex';
        return;
      }
    }
    this.hasTorch = false;
    torchBtn.style.display = 'none';
  },

  async toggleTorch() {
    if (!this.hasTorch || !this.videoStream) return;
    const track = this.videoStream.getVideoTracks()[0];
    try {
      this.isTorchOn = !this.isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: this.isTorchOn }]
      });
      showToast(this.isTorchOn ? 'Torch On' : 'Torch Off', '', 'info', 1500);
    } catch (e) {
      console.warn("Torch toggle failed:", e);
    }
  },

  startFrameLoop() {
    let lastCheck = 0;
    const loop = (timestamp) => {
      if (!this.isScanning) return;

      // Throttle scan checks to ~12 FPS (every 80ms) for high efficiency and responsive UI
      if (timestamp - lastCheck > 80) {
        lastCheck = timestamp;

        if (this.videoEl && this.videoEl.readyState >= 2) {
          const vW = this.videoEl.videoWidth;
          const vH = this.videoEl.videoHeight;

          if (this.canvasEl && this.canvasCtx && vW > 0 && vH > 0) {
            // Only update dimensions if they changed to prevent context thrashing
            if (this.canvasEl.width !== vW || this.canvasEl.height !== vH) {
              this.canvasEl.width = vW;
              this.canvasEl.height = vH;
            }

            this.canvasCtx.drawImage(this.videoEl, 0, 0, vW, vH);

            // Fast local decoding using jsQR
            if (window.jsQR) {
              try {
                const imgData = this.canvasCtx.getImageData(0, 0, vW, vH);
                const code = jsQR(imgData.data, imgData.width, imgData.height, {
                  inversionAttempts: 'attemptBoth'
                });

                if (code && code.data && code.data.trim()) {
                  const now = Date.now();
                  // Allow re-scanning same code after 2.5s cooldown
                  if (code.data !== this.lastScannedContent || (now - (this.lastScannedTimestamp || 0) > 2500)) {
                    this.lastScannedContent = code.data;
                    this.lastScannedTimestamp = now;
                    this.onQRCodeDetected(code.data);
                  }
                }
              } catch (e) {
                // Ignore transient frame read errors
              }
            }
          }
        }
      }

      this.scanIntervalId = requestAnimationFrame(loop);
    };

    this.scanIntervalId = requestAnimationFrame(loop);
  },

  bindDropZone() {
    const dropZone = document.getElementById('scanner-drop-zone');
    const fileInput = document.getElementById('scanner-file-input');
    const browseBtn = document.getElementById('btn-scanner-browse');
    const pasteBtn = document.getElementById('btn-paste-clipboard-img');
    const clearPreviewBtn = document.getElementById('btn-clear-scanner-file');

    if (!dropZone || !fileInput) return;

    const openFileDialog = (e) => {
      if (e) e.stopPropagation();
      fileInput.value = '';
      fileInput.click();
    };

    // 1. Direct Browse Button Click
    if (browseBtn) {
      browseBtn.addEventListener('click', openFileDialog);
    }

    // 2. Click on empty space inside Drop Zone (not on paste or browse buttons)
    dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-paste-clipboard-img') || e.target.closest('#btn-scanner-browse')) {
        return;
      }
      openFileDialog(e);
    });

    // 3. Direct Clipboard Paste Button
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        SoundFX.playClick();
        try {
          if (!navigator.clipboard) {
            showToast('Clipboard Notice', 'Press Ctrl + V to paste an image directly', 'info', 3000);
            return;
          }
          if (navigator.clipboard.read) {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
              const imageType = item.types.find(t => t.startsWith('image/'));
              if (imageType) {
                const blob = await item.getType(imageType);
                this.processUploadedFile(blob);
                showToast('Image Loaded', 'Decoding image from clipboard...', 'info', 2000);
                return;
              }
            }
          }
          // Fallback to text if clipboard text contains QR payload
          const text = await navigator.clipboard.readText();
          if (text && text.trim()) {
            this.onQRCodeDetected(text.trim());
            return;
          }
          showToast('No Image in Clipboard', 'Copy an image to clipboard first or press Ctrl+V', 'info', 3000);
        } catch (err) {
          showToast('Clipboard Access', 'Press Ctrl + V anywhere on screen to paste an image', 'info', 3000);
        }
      });
    }

    // 4. Clear Preview Button
    if (clearPreviewBtn) {
      clearPreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const previewWrap = document.getElementById('scanner-file-preview-wrap');
        const previewImg = document.getElementById('scanner-file-preview-img');
        if (previewWrap) previewWrap.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (fileInput) fileInput.value = '';
        const emptyNotice = document.getElementById('scan-empty-notice');
        const resultCard = document.getElementById('scan-result-card');
        if (emptyNotice) emptyNotice.style.display = 'block';
        if (resultCard) resultCard.style.display = 'none';
      });
    }

    // 5. Drag & Drop Handling
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    ['dragleave', 'dragend'].forEach(type => {
      dropZone.addEventListener(type, () => dropZone.classList.remove('dragover'));
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.processUploadedFile(e.dataTransfer.files[0]);
      }
    });

    // 6. File Input Change
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.processUploadedFile(e.target.files[0]);
      }
    });
  },

  bindGlobalPaste() {
    window.addEventListener('paste', (e) => {
      const targetTag = e.target?.tagName?.toUpperCase();
      if (['INPUT', 'TEXTAREA'].includes(targetTag) || e.target?.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      let foundImage = false;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          foundImage = true;
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            showToast('Image Pasted', 'Analyzing QR code from clipboard...', 'info', 2000);
            switchTab('scanner');
            const fileTabBtn = document.querySelector('.scanner-toggle-btn[data-mode="file"]');
            if (fileTabBtn) fileTabBtn.click();
            this.processUploadedFile(blob);
            return;
          }
        }
      }

      if (!foundImage && AppState.activeTab === 'scanner') {
        const text = e.clipboardData?.getData('text');
        if (text && text.trim()) {
          e.preventDefault();
          showToast('Text Detected', 'Analyzing decoded content...', 'info', 2000);
          this.onQRCodeDetected(text.trim());
        }
      }
    });
  },

  /**
   * Multi-scale, high-contrast client-side QR decoder
   * Tested on transparent PNGs, phone photos, screenshots, and dark mode codes.
   */
  decodeImageClient(img) {
    if (!window.jsQR) return null;

    // Test dimensions pyramid: 800, 500, 1100, original
    const dimsToTry = [];
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    [800, 500, 1100].forEach(maxDim => {
      if (origW > maxDim || origH > maxDim) {
        const scale = maxDim / Math.max(origW, origH);
        dimsToTry.push({ w: Math.round(origW * scale), h: Math.round(origH * scale) });
      }
    });
    dimsToTry.push({ w: origW, h: origH });

    for (const dim of dimsToTry) {
      const canvas = document.createElement('canvas');
      canvas.width = dim.w;
      canvas.height = dim.h;
      const ctx = canvas.getContext('2d');

      // CRITICAL: Paint pure white background first so transparent PNGs decode flawlessly!
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, dim.w, dim.h);
      ctx.drawImage(img, 0, 0, dim.w, dim.h);

      const imgData = ctx.getImageData(0, 0, dim.w, dim.h);

      // Pass 1: Standard decode with inversion attempt
      const code1 = jsQR(imgData.data, dim.w, dim.h, { inversionAttempts: 'attemptBoth' });
      if (code1 && code1.data && code1.data.trim()) {
        return code1.data.trim();
      }

      // Pass 2: High-contrast binarization pass (for low light / washed out camera photos)
      const data = imgData.data;
      let totalLuma = 0;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        totalLuma += luma;
      }
      const avgLuma = totalLuma / (len / 4);

      for (let i = 0; i < len; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const val = luma > avgLuma ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }

      const code2 = jsQR(data, dim.w, dim.h, { inversionAttempts: 'attemptBoth' });
      if (code2 && code2.data && code2.data.trim()) {
        return code2.data.trim();
      }
    }

    return null;
  },

  async processUploadedFile(file) {
    SoundFX.playClick();
    showToast('Analyzing Image...', 'Running high-precision optical detector', 'info', 2000);

    // Show preview thumbnail in drop zone
    const previewWrap = document.getElementById('scanner-file-preview-wrap');
    const previewImg = document.getElementById('scanner-file-preview-img');
    const objectUrl = URL.createObjectURL(file);

    if (previewWrap && previewImg) {
      previewImg.src = objectUrl;
      previewWrap.style.display = 'block';
    }

    // Step 1: High-Performance Multi-Pass Client Decoding
    try {
      const img = new Image();
      img.onload = () => {
        const clientDecoded = this.decodeImageClient(img);
        URL.revokeObjectURL(objectUrl);

        if (clientDecoded) {
          this.onQRCodeDetected(clientDecoded);
          return;
        }

        // Step 2: Fallback to Advanced OpenCV Backend Pipeline
        this.processBackendScan(file);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        this.processBackendScan(file);
      };
      img.src = objectUrl;
    } catch (e) {
      this.processBackendScan(file);
    }
  },

  async processBackendScan(file) {
    const formData = new FormData();
    formData.append('file', file);

    const apiBase = window.API_BASE || '';
    try {
      const res = await fetch(`${apiBase}/api/scan`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json = await res.json();
      const raw = json.raw || json.data || json.content;
      const isSuccess = (json.success === true || json.status === 'success') && !!raw;

      if (isSuccess) {
        this.onQRCodeDetected(raw, json.parsed);
      } else {
        showToast('No QR Code Detected', json.error || 'Please make sure the QR code image is clear and in focus.', 'error', 4000);
      }
    } catch (e) {
      showToast('Scan Issue', 'Could not detect a QR code in this image. Try another photo or ensure adequate lighting.', 'error', 4000);
    }
  },

  async onQRCodeDetected(rawText, parsedObj = null) {
    SoundFX.playScanFound();

    let parsed = parsedObj;
    if (!parsed) {
      try {
        const apiBase = window.API_BASE || '';
        const res = await fetch(`${apiBase}/api/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: rawText })
        });
        if (res.ok) {
          const pJson = await res.json();
          parsed = pJson.parsed || pJson;
        }
      } catch (e) {
        parsed = null;
      }
    }

    // Client-side parser fallback if backend parsing isn't reachable
    if (!parsed) {
      parsed = this.parseContentClient(rawText);
    }

    this.displayResult(rawText, parsed);

    // Save to History
    if (window.HistoryManager) {
      window.HistoryManager.addEntry({
        type: parsed.type || 'text',
        content: rawText,
        title: parsed.title || 'Scanned QR',
        source: 'scanned'
      });
    }

    showToast('QR Code Decoded!', parsed.title || 'Content detected successfully', 'success', 3000);
  },

  parseContentClient(text) {
    const t = text.trim();
    if (t.startsWith('WIFI:')) {
      const ssid = (t.match(/S:([^;]*);/) || [])[1] || '';
      const pass = (t.match(/P:([^;]*);/) || [])[1] || '';
      const auth = (t.match(/T:([^;]*);/) || [])[1] || 'WPA';
      return { type: 'wifi', title: 'Wi-Fi Network', data: { ssid, password: pass, auth } };
    }
    if (t.toUpperCase().startsWith('BEGIN:VCARD')) {
      const fn = (t.match(/(?:^|\n)FN:(.*?)(?:\r?\n|$)/i) || [])[1] || 'Contact';
      const tel = (t.match(/(?:^|\n)TEL[^:]*:(.*?)(?:\r?\n|$)/i) || [])[1] || '';
      const email = (t.match(/(?:^|\n)EMAIL[^:]*:(.*?)(?:\r?\n|$)/i) || [])[1] || '';
      return { type: 'vcard', title: 'Contact Card (vCard)', data: { name: fn, phone: tel, email } };
    }
    if (/^(https?:\/\/|www\.)/i.test(t)) {
      const url = /^https?:\/\//i.test(t) ? t : 'https://' + t;
      return { type: 'url', title: 'Website Link', data: { url } };
    }
    if (t.toLowerCase().startsWith('mailto:')) {
      return { type: 'email', title: 'Email Address', data: { email: t.replace(/^mailto:/i, '') } };
    }
    if (t.toLowerCase().startsWith('tel:')) {
      return { type: 'phone', title: 'Phone Call', data: { phone: t.replace(/^tel:/i, '') } };
    }
    if (t.toLowerCase().startsWith('smsto:') || t.toLowerCase().startsWith('sms:')) {
      return { type: 'sms', title: 'SMS Message', data: { raw: t } };
    }
    if (t.toLowerCase().startsWith('geo:')) {
      return { type: 'geo', title: 'Geo Location', data: { coordinates: t.replace(/^geo:/i, '') } };
    }
    if (t.toUpperCase().startsWith('BEGIN:VEVENT') || t.toUpperCase().startsWith('BEGIN:VCALENDAR')) {
      const title = (t.match(/(?:^|\n)SUMMARY:(.*?)(?:\r?\n|$)/i) || [])[1] || 'Calendar Event';
      return { type: 'event', title: 'Calendar Event', data: { title } };
    }
    return { type: 'text', title: 'Plain Text', data: { text: t, length: t.length } };
  },

  displayResult(rawText, parsed) {
    const resultCard = document.getElementById('scan-result-card');
    const emptyNotice = document.getElementById('scan-empty-notice');
    if (!resultCard) return;

    if (emptyNotice) emptyNotice.style.display = 'none';
    resultCard.style.display = 'flex';

    const badge = document.getElementById('scan-type-badge');
    if (badge) {
      badge.textContent = parsed.title || parsed.type.toUpperCase();
    }

    const timeEl = document.getElementById('scan-timestamp-val');
    if (timeEl) {
      timeEl.textContent = new Date().toLocaleTimeString();
    }

    const rawEl = document.getElementById('scan-raw-text');
    if (rawEl) {
      rawEl.textContent = rawText;
    }

    const structuredContainer = document.getElementById('scan-structured-fields');
    if (structuredContainer) {
      structuredContainer.innerHTML = '';
      const data = parsed.data || {};

      Object.entries(data).forEach(([key, val]) => {
        if (key === 'raw_vcf' || typeof val === 'object' || !val) return;
        const row = document.createElement('div');
        row.className = 'structured-row';
        row.innerHTML = `
          <span class="structured-key">${key.toUpperCase()}</span>
          <span class="structured-val">${val}</span>
        `;
        structuredContainer.appendChild(row);
      });
    }

    const actionsContainer = document.getElementById('scan-contextual-actions');
    if (actionsContainer) {
      actionsContainer.innerHTML = '';

      // Helper to add action button
      const addBtn = (label, svgIcon, onClick, href = null, isPrimary = true) => {
        const el = href ? document.createElement('a') : document.createElement('button');
        el.className = isPrimary ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
        el.innerHTML = `${svgIcon} <span>${label}</span>`;
        if (href) {
          el.href = href;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
        }
        if (onClick) {
          el.addEventListener('click', (e) => {
            if (!href) e.preventDefault();
            onClick();
          });
        }
        actionsContainer.appendChild(el);
      };

      // 1. URL Action
      if (parsed.type === 'url') {
        const targetUrl = parsed.data?.url || rawText;
        addBtn('Open Link', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`, null, targetUrl, true);
        addBtn('Copy URL', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`, () => {
          navigator.clipboard.writeText(targetUrl);
          showToast('Copied URL', targetUrl, 'success', 2000);
        }, null, false);
      }

      // 2. Wi-Fi Actions
      else if (parsed.type === 'wifi') {
        const pass = parsed.data?.password || '';
        if (pass) {
          addBtn('Copy Wi-Fi Password', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`, () => {
            navigator.clipboard.writeText(pass);
            showToast('Password Copied!', pass, 'success', 2500);
          }, null, true);
        }
        const ssid = parsed.data?.ssid || '';
        if (ssid) {
          addBtn('Copy SSID', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/></svg>`, () => {
            navigator.clipboard.writeText(ssid);
            showToast('Network Name Copied', ssid, 'info', 2000);
          }, null, false);
        }
      }

      // 3. vCard Action
      else if (parsed.type === 'vcard') {
        addBtn('Save Contact (.vcf)', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`, () => {
          const blob = new Blob([rawText], { type: 'text/vcard' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${parsed.data?.name || 'contact'}.vcf`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('Contact Saved', 'Downloaded .vcf file', 'success', 2500);
        }, null, true);
      }

      // 4. Email Action
      else if (parsed.type === 'email') {
        const mailHref = rawText.startsWith('mailto:') ? rawText : `mailto:${parsed.data?.to || rawText}`;
        addBtn('Send Email', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`, null, mailHref, true);
      }

      // 5. Phone Action
      else if (parsed.type === 'phone') {
        const phoneNum = parsed.data?.phone || rawText.replace(/^tel:/i, '');
        addBtn('Call Phone', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`, null, `tel:${phoneNum}`, true);
        addBtn('Copy Number', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`, () => {
          navigator.clipboard.writeText(phoneNum);
          showToast('Copied Number', phoneNum, 'success', 2000);
        }, null, false);
      }

      // 6. SMS / WhatsApp Action
      else if (parsed.type === 'sms') {
        const phone = parsed.data?.phone || '';
        const msg = parsed.data?.message || '';
        addBtn('Send SMS', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, null, `sms:${phone}?body=${encodeURIComponent(msg)}`, true);
        if (phone) {
          const cleanPhone = phone.replace(/[^0-9]/g, '');
          addBtn('Open WhatsApp', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`, null, `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, false);
        }
      }

      // 7. Geo Action
      else if (parsed.type === 'geo') {
        const mapsUrl = parsed.data?.maps_url || `https://www.google.com/maps?q=${parsed.data?.latitude || '0'},${parsed.data?.longitude || '0'}`;
        addBtn('Open in Google Maps', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`, null, mapsUrl, true);
      }

      // 8. Crypto / Payment Action
      else if (parsed.type === 'crypto') {
        addBtn('Copy Payment / Address', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`, () => {
          navigator.clipboard.writeText(rawText);
          showToast('Payment String Copied', rawText, 'success', 2500);
        }, null, true);
      }

      // 9. Calendar Event Action
      else if (parsed.type === 'event') {
        addBtn('Download Event (.ics)', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`, () => {
          const icsData = rawText.includes('BEGIN:VCALENDAR') ? rawText : `BEGIN:VCALENDAR\nVERSION:2.0\n${rawText}\nEND:VCALENDAR`;
          const blob = new Blob([icsData], { type: 'text/calendar' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${parsed.data?.title || 'event'}.ics`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('Event Downloaded', 'Import into Outlook or Google Calendar', 'success', 2500);
        }, null, true);
      }

      // 10. Default Plain Text Action
      else {
        addBtn('Search Web', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`, null, `https://www.google.com/search?q=${encodeURIComponent(rawText)}`, true);
      }
    }
  },

  bindResultActions() {
    const copyRawBtn = document.getElementById('btn-copy-scanned-raw');
    const openInGenBtn = document.getElementById('btn-open-in-generator');

    if (copyRawBtn) {
      copyRawBtn.addEventListener('click', () => {
        SoundFX.playClick();
        const text = document.getElementById('scan-raw-text')?.textContent;
        if (text) {
          navigator.clipboard.writeText(text);
          SoundFX.playSuccess();
          showToast('Copied to Clipboard!', text.substring(0, 40) + '...', 'success', 2000);
        }
      });
    }

    if (openInGenBtn) {
      openInGenBtn.addEventListener('click', () => {
        SoundFX.playClick();
        const text = document.getElementById('scan-raw-text')?.textContent;
        if (text && window.Generator) {
          window.Generator.loadData(text, 'text');
        }
      });
    }
  }
};

window.ScannerManager = ScannerManager;
document.addEventListener('DOMContentLoaded', () => {
  ScannerManager.init();
});
