/**
 * QUANTUMQR PRO - HISTORY & ANALYTICS MANAGER
 * Stores, filters, searches, and exports past generated and scanned codes.
 */

const HistoryManager = {
  storageKey: 'quantum_qr_history',
  activeFilter: 'all', // 'all', 'generated', 'scanned'
  searchQuery: '',

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey)) || [];
    } catch (e) {
      return [];
    }
  },

  saveHistory(list) {
    localStorage.setItem(this.storageKey, JSON.stringify(list.slice(0, 50))); // keep latest 50
  },

  addEntry(entry) {
    const list = this.getHistory();
    // Prevent duplicate entries within 5 seconds
    const isDuplicate = list.length > 0 && list[0].content === entry.content && (Date.now() - list[0].timestamp < 5000);
    if (isDuplicate) return;

    const item = {
      id: 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: entry.type || 'text',
      title: entry.title || 'QR Code',
      content: entry.content || '',
      thumb: entry.thumb || null,
      source: entry.source || 'generated',
      timestamp: Date.now()
    };

    list.unshift(item);
    this.saveHistory(list);

    if (AppState.activeTab === 'history') {
      this.render();
    }
  },

  deleteEntry(id) {
    let list = this.getHistory();
    list = list.filter(item => item.id !== id);
    this.saveHistory(list);
    this.render();
    showToast('Item Removed', '', 'info', 1500);
  },

  clearAll() {
    if (!confirm('Are you sure you want to clear your entire QR history?')) return;
    localStorage.removeItem(this.storageKey);
    this.render();
    SoundFX.playClick();
    showToast('History Cleared', 'All stored codes removed', 'info', 2000);
  },

  init() {
    this.bindControls();
    this.render();
  },

  bindControls() {
    // Filter chips
    const filterChips = document.querySelectorAll('.history-filter-chip');
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        SoundFX.playClick();
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilter = chip.dataset.filter;
        this.render();
      });
    });

    // Search bar
    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Clear All button
    const clearBtn = document.getElementById('btn-clear-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAll());
    }

    // Export JSON
    const exportJsonBtn = document.getElementById('btn-export-history-json');
    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => this.exportJSON());
    }

    // Export CSV
    const exportCsvBtn = document.getElementById('btn-export-history-csv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.exportCSV());
    }
  },

  exportJSON() {
    const list = this.getHistory();
    if (list.length === 0) {
      showToast('Empty History', 'No items to export', 'info');
      return;
    }
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    this.triggerDownload(blob, `quantum_qr_history_${Date.now()}.json`);
  },

  exportCSV() {
    const list = this.getHistory();
    if (list.length === 0) {
      showToast('Empty History', 'No items to export', 'info');
      return;
    }

    const header = ['ID', 'Type', 'Title', 'Source', 'Content', 'Date'];
    const rows = list.map(item => [
      item.id,
      item.type,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      item.source,
      `"${(item.content || '').replace(/"/g, '""')}"`,
      new Date(item.timestamp).toISOString()
    ]);

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    this.triggerDownload(blob, `quantum_qr_history_${Date.now()}.csv`);
  },

  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Export Saved', filename, 'success');
  },

  render() {
    const container = document.getElementById('history-cards-grid');
    const countBadge = document.getElementById('history-total-count');
    if (!container) return;

    let items = this.getHistory();

    // Filter by type/source
    if (this.activeFilter === 'generated') {
      items = items.filter(i => i.source === 'generated');
    } else if (this.activeFilter === 'scanned') {
      items = items.filter(i => i.source === 'scanned');
    }

    // Filter by search query
    if (this.searchQuery) {
      items = items.filter(i =>
        (i.content && i.content.toLowerCase().includes(this.searchQuery)) ||
        (i.title && i.title.toLowerCase().includes(this.searchQuery)) ||
        (i.type && i.type.toLowerCase().includes(this.searchQuery))
      );
    }

    if (countBadge) countBadge.textContent = `${items.length} Saved`;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <h3>No History Found</h3>
          <p style="margin-top: 0.4rem; font-size: 0.85rem;">Generated and scanned QR codes will appear here automatically.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const dateStr = new Date(item.timestamp).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      // Default thumbnail SVG if none stored
      const thumbSrc = item.thumb || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='60' height='60' fill='none' stroke='%236366f1' stroke-width='2'%3E%3Crect x='3' y='3' width='7' height='7'/%3E%3Crect x='14' y='3' width='7' height='7'/%3E%3Crect x='3' y='14' width='7' height='7'/%3E%3Crect x='14' y='14' width='7' height='7'/%3E%3C/svg%3E";

      card.innerHTML = `
        <div class="history-thumb-row">
          <img class="history-qr-thumb" src="${thumbSrc}" alt="Thumbnail" />
          <div class="history-meta-col">
            <span class="history-type-badge">${item.source.toUpperCase()} &bull; ${item.type}</span>
            <div class="history-content-snippet" title="${item.content}">${item.title || item.content}</div>
            <span class="history-date">${dateStr}</span>
          </div>
        </div>
        <div class="history-card-actions">
          <button class="btn btn-secondary btn-sm copy-btn" title="Copy Content" style="flex:1;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
          <button class="btn btn-secondary btn-sm load-btn" title="Open in Generator" style="flex:1;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button class="btn btn-secondary btn-sm del-btn" title="Delete" style="color:#ef4444;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;

      // Copy Action
      card.querySelector('.copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(item.content);
        SoundFX.playSuccess();
        showToast('Copied to Clipboard!', item.content.substring(0, 35) + '...', 'success', 2000);
      });

      // Load into Generator Studio
      card.querySelector('.load-btn').addEventListener('click', () => {
        if (window.Generator) {
          window.Generator.loadData(item.content, item.type);
        }
      });

      // Delete action
      card.querySelector('.del-btn').addEventListener('click', () => {
        this.deleteEntry(item.id);
      });

      container.appendChild(card);
    });
  }
};

window.HistoryManager = HistoryManager;
document.addEventListener('DOMContentLoaded', () => {
  HistoryManager.init();
});
