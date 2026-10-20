window.API_BASE = (window.location.port !== '5000' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'))
  ? 'http://127.0.0.1:5000'
  : '';

const AppState = {
  theme: localStorage.getItem('quantum_theme') || 'dark',
  soundEnabled: localStorage.getItem('quantum_sound') !== 'false',
  activeTab: 'generator'
};

// Web Audio API Sound Synthesizer (No external MP3 files needed)
const SoundFX = {
  ctx: null,
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  },
  playBeep(freq = 880, type = 'sine', duration = 0.12) {
    if (!AppState.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio playback not allowed yet:", e);
    }
  },
  playSuccess() {
    this.playBeep(587.33, 'triangle', 0.08);
    setTimeout(() => this.playBeep(880, 'triangle', 0.14), 80);
  },
  playScanFound() {
    this.playBeep(784, 'sine', 0.09);
    setTimeout(() => this.playBeep(1046.5, 'sine', 0.18), 90);
  },
  playClick() {
    this.playBeep(440, 'sine', 0.04);
  }
};

// Toast Notification System
function showToast(title, message = '', type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconSvg = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  }[type] || '';

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <span class="toast-title">${title}</span>
      ${message ? `<span class="toast-message">${message}</span>` : ''}
    </div>
    <button class="toast-close-btn" aria-label="Close Toast">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
  `;

  container.appendChild(toast);

  // Trigger CSS transition
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const closeBtn = toast.querySelector('.toast-close-btn');
  const dismiss = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  };

  closeBtn.addEventListener('click', dismiss);
  const timer = setTimeout(dismiss, duration);

  toast.addEventListener('mouseenter', () => clearTimeout(timer));
}

// Tab Switching Controller
function initTabs() {
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      if (!target) return;

      SoundFX.playClick();

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const activePane = document.getElementById(`tab-${target}`);
      if (activePane) {
        activePane.classList.add('active');
      }

      AppState.activeTab = target;

      // Lifecycle hooks for specific tabs
      if (target === 'scanner') {
        if (window.ScannerManager) {
          window.ScannerManager.onTabActivated();
        }
      } else {
        if (window.ScannerManager) {
          window.ScannerManager.onTabDeactivated();
        }
      }

      if (target === 'batch') {
        if (window.BatchManager) {
          window.BatchManager.onTabActivated();
        }
      }

      if (target === 'history' && window.HistoryManager) {
        window.HistoryManager.render();
      }
    });
  });
}

// Theme Switching Controller
function initTheme() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const applyTheme = (th) => {
    document.documentElement.setAttribute('data-theme', th);
    localStorage.setItem('quantum_theme', th);
    AppState.theme = th;
    if (themeBtn) {
      themeBtn.title = th === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }
  };

  applyTheme(AppState.theme);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      SoundFX.playClick();
      const nextTheme = AppState.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      showToast(nextTheme === 'dark' ? 'Cyber Dark Mode' : 'Crystal Light Mode', '', 'info', 2000);
    });
  }
}

// Sound Toggle Controller
function initSoundToggle() {
  const soundBtn = document.getElementById('sound-toggle-btn');
  if (!soundBtn) return;

  const updateSoundUI = () => {
    soundBtn.classList.toggle('active', AppState.soundEnabled);
    soundBtn.title = AppState.soundEnabled ? 'Mute Audio Effects' : 'Enable Audio Effects';
  };

  updateSoundUI();

  soundBtn.addEventListener('click', () => {
    AppState.soundEnabled = !AppState.soundEnabled;
    localStorage.setItem('quantum_sound', AppState.soundEnabled);
    updateSoundUI();
    if (AppState.soundEnabled) {
      SoundFX.playSuccess();
      showToast('Audio FX Enabled', 'Scan and action sound beeps active', 'info', 2000);
    } else {
      showToast('Audio FX Muted', '', 'info', 2000);
    }
  });
}

// Fullscreen Toggle Controller
function initFullscreen() {
  const fsBtn = document.getElementById('fullscreen-btn');
  if (!fsBtn) return;

  fsBtn.addEventListener('click', () => {
    SoundFX.playClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn("Fullscreen request denied:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });
}

// Switch Tab Programmatically helper
function switchTab(tabName) {
  const targetBtn = document.querySelector(`.nav-tab-btn[data-tab="${tabName}"]`);
  if (targetBtn) {
    targetBtn.click();
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTheme();
  initSoundToggle();
  initFullscreen();
  console.log("⚡ QuantumQR Pro Application Controller Initialized.");
});
