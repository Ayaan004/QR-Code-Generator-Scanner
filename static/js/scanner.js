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
    const loop = () => {
      if (!this.isScanning) return;

      if (this.videoEl && this.videoEl.readyState >= 2) {
        const vW = this.videoEl.videoWidth;
        const vH = this.videoEl.videoHeight;

        if (this.canvasEl && this.canvasCtx && vW > 0 && vH > 0) {
          this.canvasEl.width = vW;
          this.canvasEl.height = vH;
          this.canvasCtx.drawImage(this.videoEl, 0, 0, vW, vH);

          // Fast local decoding using jsQR
          if (window.jsQR) {
            const imgData = this.canvasCtx.getImageData(0, 0, vW, vH);
            const code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'dontInvert'
            });

            if (code && code.data && code.data.trim()) {
              if (code.data !== this.lastScannedContent) {
                this.lastScannedContent = code.data;
                this.onQRCodeDetected(code.data);
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

    if (!dropZone || !fileInput) return;

    // Trigger file chooser on drop zone click
    dropZone.addEventListener('click', (e) => {
      fileInput.value = '';
      fileInput.click();
    });

    // Also trigger specifically on the Browse button
    const browseBtn = dropZone.querySelector('button');
    if (browseBtn) {
      browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        fileInput.click();
      });
    }

    // Direct Clipboard Paste Button
    const pasteBtn = document.getElementById('btn-paste-clipboard-img');
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
          // Fallback to text if no image
          const text = await navigator.clipboard.readText();
          if (text && text.trim()) {
            this.onQRCodeDetected(text.trim());
            return;
          }
          showToast('No Image Found', 'Copy an image to your clipboard first, or press Ctrl+V', 'info', 3000);
        } catch (err) {
          showToast('Clipboard Notice', 'Press Ctrl + V anywhere to paste an image', 'info', 3000);
        }
      });
    }

    // Clear preview button
    const clearPreviewBtn = document.getElementById('btn-clear-scanner-file');
    if (clearPreviewBtn) {
      clearPreviewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const previewWrap = document.getElementById('scanner-file-preview-wrap');
        const previewImg = document.getElementById('scanner-file-preview-img');
        if (previewWrap) previewWrap.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (fileInput) fileInput.value = '';
      });
    }

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

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.processUploadedFile(e.target.files[0]);
      }
    });
  },

  bindGlobalPaste() {
    window.addEventListener('paste', (e) => {
      // Do not intercept if user is typing into an input, textarea, or contentEditable
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
            showToast('Image Pasted', 'Decoding QR code from clipboard...', 'info', 2000);
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
          showToast('Text Pasted', 'Analyzing decoded content...', 'info', 2000);
          this.onQRCodeDetected(text.trim());
        }
      }
    });
  },

  async processUploadedFile(file) {
    SoundFX.playClick();
    showToast('Analyzing Image...', 'Running high-precision detector', 'info', 2000);

    // Show preview thumbnail in drop zone
    const previewWrap = document.getElementById('scanner-file-preview-wrap');
    const previewImg = document.getElementById('scanner-file-preview-img');
    if (previewWrap && previewImg) {
      previewImg.src = URL.createObjectURL(file);
      previewWrap.style.display = 'block';
    }

    // Step 1: Fast Client-side decoding with jsQR
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        // Resize down if huge for fast scan
        const maxDim = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const testCanvas = document.createElement('canvas');
        testCanvas.width = w;
        testCanvas.height = h;
        const testCtx = testCanvas.getContext('2d');
        testCtx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);

        if (window.jsQR) {
          const imgData = testCtx.getImageData(0, 0, w, h);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'attemptBoth'
          });
          if (code && code.data && code.data.trim()) {
            this.onQRCodeDetected(code.data);
            return;
          }
        }
        // Fallback to backend OpenCV decoder
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

      const json = await res.json();
      const raw = json.raw || json.data || json.content;
      const isSuccess = (json.success === true || json.status === 'success') && !!raw;

      if (isSuccess) {
        this.onQRCodeDetected(raw, json.parsed);
      } else {
        showToast('No QR Code Found', json.error || json.message || 'Please ensure the QR code is clearly visible.', 'error', 3500);
      }
    } catch (e) {
      showToast('Scan Failed', e.message, 'error', 3500);
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
        const pJson = await res.json();
        parsed = pJson.parsed || pJson;
      } catch (e) {
        parsed = { type: 'text', title: 'Scanned Text', data: { text: rawText } };
      }
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
        if (key === 'raw_vcf' || typeof val === 'object') return;
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

      if (parsed.type === 'url') {
        const openBtn = document.createElement('a');
        openBtn.className = 'btn btn-primary btn-sm';
        openBtn.href = parsed.data.url;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener noreferrer';
        openBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Link
        `;
        actionsContainer.appendChild(openBtn);
      } else if (parsed.type === 'wifi') {
        const copyPassBtn = document.createElement('button');
        copyPassBtn.className = 'btn btn-primary btn-sm';
        copyPassBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy Password
        `;
        copyPassBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(parsed.data.password || '');
          showToast('Password Copied!', parsed.data.password, 'success');
        });
        actionsContainer.appendChild(copyPassBtn);
      } else if (parsed.type === 'vcard') {
        const vcfBtn = document.createElement('button');
        vcfBtn.className = 'btn btn-primary btn-sm';
        vcfBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Save Contact (.vcf)
        `;
        vcfBtn.addEventListener('click', () => {
          const blob = new Blob([rawText], { type: 'text/vcard' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${parsed.data.name || 'contact'}.vcf`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('Contact Saved', 'Downloaded .vcf file', 'success');
        });
        actionsContainer.appendChild(vcfBtn);
      } else if (parsed.type === 'email') {
        const mailBtn = document.createElement('a');
        mailBtn.className = 'btn btn-primary btn-sm';
        mailBtn.href = rawText;
        mailBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Send Email
        `;
        actionsContainer.appendChild(mailBtn);
      } else if (parsed.type === 'geo') {
        const mapBtn = document.createElement('a');
        mapBtn.className = 'btn btn-primary btn-sm';
        mapBtn.href = parsed.data.maps_url;
        mapBtn.target = '_blank';
        mapBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Open Maps
        `;
        actionsContainer.appendChild(mapBtn);
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
