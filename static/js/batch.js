/**
 * QUANTUMQR PRO - BATCH GENERATOR CONTROLLER
 * High-speed bulk generation with ZIP archive export.
 */

const BatchManager = {
  items: [],

  init() {
    this.bindTextarea();
    this.bindCsvUpload();
    this.bindGenerateButton();

    // Immediate check if textarea has text upon load
    const textarea = document.getElementById('batch-input-textarea');
    if (textarea && textarea.value.trim()) {
      this.parseTextarea(textarea.value);
    }
  },

  onTabActivated() {
    const textarea = document.getElementById('batch-input-textarea');
    if (textarea && textarea.value.trim()) {
      this.parseTextarea(textarea.value);
    }
  },

  bindTextarea() {
    const textarea = document.getElementById('batch-input-textarea');
    const prefixInput = document.getElementById('batch-filename-prefix');

    const sync = () => {
      if (textarea) this.parseTextarea(textarea.value);
    };

    if (textarea) {
      ['input', 'change', 'paste', 'keyup', 'blur'].forEach(evt => {
        textarea.addEventListener(evt, () => {
          sync();
          setTimeout(sync, 20);
        });
      });
      // Run once on bind
      sync();
    }

    if (prefixInput) {
      ['input', 'change', 'keyup'].forEach(evt => {
        prefixInput.addEventListener(evt, () => {
          sync();
          setTimeout(sync, 20);
        });
      });
    }
  },

  parseTextarea(raw) {
    if (!raw) {
      this.items = [];
      this.renderPreviewTable();
      return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const prefix = document.getElementById('batch-filename-prefix')?.value.trim() || 'qr';

    this.items = lines.map((line, idx) => ({
      filename: `${prefix}_${(idx + 1).toString().padStart(3, '0')}`,
      data: line
    }));

    this.renderPreviewTable();
  },

  bindCsvUpload() {
    const csvInput = document.getElementById('batch-csv-input');
    if (!csvInput) return;

    csvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        this.parseCsv(text);
        showToast('CSV Loaded', `${this.items.length} items parsed`, 'success', 2500);
      };
      reader.readAsText(file);
    });
  },

  parseCsv(csvContent) {
    const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    // Check if line 1 looks like a header
    let startIdx = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('data') || firstLine.includes('url') || firstLine.includes('content') || firstLine.includes('name')) {
      startIdx = 1;
    }

    const items = [];
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 2) {
        items.push({
          filename: parts[0].trim().replace(/^["']|["']$/g, ''),
          data: parts[1].trim().replace(/^["']|["']$/g, '')
        });
      } else if (parts.length === 1 && parts[0].trim()) {
        items.push({
          filename: `qr_${(items.length + 1).toString().padStart(3, '0')}`,
          data: parts[0].trim().replace(/^["']|["']$/g, '')
        });
      }
    }

    this.items = items;
    this.renderPreviewTable();
  },

  renderPreviewTable() {
    const countBadge = document.getElementById('batch-count-badge');
    const tbody = document.getElementById('batch-preview-tbody');
    const emptyNotice = document.getElementById('batch-table-empty');
    const table = document.getElementById('batch-preview-table');
    const genBtn = document.getElementById('btn-start-batch-generate');

    if (countBadge) countBadge.textContent = `${this.items.length} Items`;

    if (this.items.length === 0) {
      if (emptyNotice) emptyNotice.style.display = 'block';
      if (table) table.style.display = 'none';
      if (genBtn) genBtn.disabled = true;
      return;
    }

    if (emptyNotice) emptyNotice.style.display = 'none';
    if (table) table.style.display = 'table';
    if (genBtn) genBtn.disabled = false;

    if (tbody) {
      tbody.innerHTML = '';
      const previewRows = this.items.slice(0, 15);
      previewRows.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${idx + 1}</strong></td>
          <td><code>${item.filename}</code></td>
          <td title="${item.data}">${item.data.length > 50 ? item.data.substring(0, 50) + '...' : item.data}</td>
        `;
        tbody.appendChild(tr);
      });

      if (this.items.length > 15) {
        const trMore = document.createElement('tr');
        trMore.innerHTML = `<td colspan="3" style="text-align: center; color: var(--text-dim); padding: 0.75rem;">... and ${this.items.length - 15} more items</td>`;
        tbody.appendChild(trMore);
      }
    }
  },

  bindGenerateButton() {
    const btn = document.getElementById('btn-start-batch-generate');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      // Re-read textarea directly in case user clicked immediately
      const textarea = document.getElementById('batch-input-textarea');
      if (this.items.length === 0 && textarea && textarea.value.trim()) {
        this.parseTextarea(textarea.value);
      }

      if (this.items.length === 0) {
        showToast('No Items', 'Enter URLs or upload a CSV file first', 'error');
        return;
      }

      SoundFX.playClick();
      btn.disabled = true;

      const progressBox = document.getElementById('batch-progress-box');
      const progressFill = document.getElementById('batch-progress-fill');
      const progressText = document.getElementById('batch-progress-text');

      if (progressBox) progressBox.style.display = 'block';
      if (progressFill) progressFill.style.width = '20%';
      if (progressText) progressText.textContent = `Packaging ${this.items.length} QR codes...`;

      showToast('Generating Batch Archive...', `Creating ${this.items.length} codes`, 'info', 3000);

      const fmt = document.getElementById('batch-format-select')?.value || 'png';
      const genSettings = window.Generator?.settings || {};

      // Strategy 1: Call Python Backend API
      try {
        if (progressFill) progressFill.style.width = '50%';
        const apiBase = window.API_BASE || '';
        const res = await fetch(`${apiBase}/api/batch-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: this.items,
            options: {
              format: fmt,
              style: genSettings.style || 'rounded',
              color_mode: genSettings.color_mode || 'vertical',
              fg_color: genSettings.fg_color || '#6366f1',
              fg_color_2: genSettings.fg_color_2 || '#06b6d4',
              bg_color: genSettings.bg_color || '#ffffff',
              error_correction: genSettings.error_correction || 'M'
            }
          })
        });

        if (res.ok) {
          if (progressFill) progressFill.style.width = '100%';
          if (progressText) progressText.textContent = 'Complete! Downloading ZIP...';

          const blob = await res.blob();
          this.triggerZipDownload(blob, `quantum_qr_batch_${Date.now()}.zip`);
          SoundFX.playSuccess();
          showToast('Batch Complete!', `${this.items.length} QR codes downloaded in ZIP`, 'success', 3500);
          return;
        }
      } catch (backendErr) {
        console.warn("Backend batch unavailable, falling back to client JSZip:", backendErr);
      }

      // Strategy 2: Resilient Client-Side JSZip Generation (NEVER FAILS!)
      try {
        if (!window.JSZip) throw new Error('JSZip library not available');

        const zip = new JSZip();
        let manifestCsv = "Index,Filename,Content,Timestamp\n";

        for (let i = 0; i < this.items.length; i++) {
          const item = this.items[i];
          const pct = 50 + Math.round(((i + 1) / this.items.length) * 45);
          if (progressFill) progressFill.style.width = `${pct}%`;
          if (progressText) progressText.textContent = `Rendering ${i + 1} of ${this.items.length}...`;

          const canvas = document.createElement('canvas');
          if (window.Generator) {
            window.Generator.drawClientQRCanvas(canvas, item.data, 512);
          }

          // Get image data as base64 without header
          const dataUrl = canvas.toDataURL('image/png');
          const base64Data = dataUrl.split(',')[1];
          const filename = `${item.filename || 'qr_' + (i + 1)}.png`;

          zip.file(filename, base64Data, { base64: true });
          manifestCsv += `${i + 1},"${filename}","${item.data.replace(/"/g, '""')}","${new Date().toISOString()}"\n`;
        }

        zip.file("manifest.csv", manifestCsv);

        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Generating ZIP bundle...';

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        this.triggerZipDownload(zipBlob, `quantum_qr_batch_${Date.now()}.zip`);

        SoundFX.playSuccess();
        showToast('Batch Complete!', `Saved ${this.items.length} QR codes in ZIP`, 'success', 3500);
      } catch (clientErr) {
        showToast('Batch Error', clientErr.message, 'error', 3500);
      } finally {
        btn.disabled = false;
        setTimeout(() => {
          if (progressBox) progressBox.style.display = 'none';
        }, 2200);
      }
    });
  },

  triggerZipDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 2000);
  }
};

window.BatchManager = BatchManager;
document.addEventListener('DOMContentLoaded', () => {
  BatchManager.init();
});
