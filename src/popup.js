'use strict';

const historyView = document.getElementById('historyView');
const settingsView = document.getElementById('settingsView');
const settingsBtn = document.getElementById('settingsBtn');
const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const openShortcutsBtn = document.getElementById('openShortcutsBtn');
const backKey = document.getElementById('backKey');
const fwdKey = document.getElementById('fwdKey');
const currentBackKey = document.getElementById('currentBackKey');
const currentFwdKey = document.getElementById('currentFwdKey');

let showingSettings = false;

// ─── View Toggle ─────────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => {
  showingSettings = !showingSettings;
  historyView.classList.toggle('hidden', showingSettings);
  settingsView.classList.toggle('hidden', !showingSettings);
  settingsBtn.classList.toggle('active', showingSettings);
});

// ─── Shortcuts ───────────────────────────────────────────────────────────────

async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const backCmd = commands.find(c => c.name === 'navigate-back');
  const fwdCmd = commands.find(c => c.name === 'navigate-forward');

  const backShortcut = backCmd?.shortcut || 'Not set';
  const fwdShortcut = fwdCmd?.shortcut || 'Not set';

  backKey.textContent = backShortcut;
  fwdKey.textContent = fwdShortcut;
  currentBackKey.textContent = backShortcut;
  currentFwdKey.textContent = fwdShortcut;
}

openShortcutsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
});

// ─── History Rendering ────────────────────────────────────────────────────────

function renderFavicon(tab) {
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    const img = document.createElement('img');
    img.className = 'item-favicon';
    img.src = tab.favIconUrl;
    img.onerror = () => img.replaceWith(makeFaviconPlaceholder());
    return img;
  }
  return makeFaviconPlaceholder();
}

function makeFaviconPlaceholder() {
  const div = document.createElement('div');
  div.className = 'item-favicon-placeholder';
  div.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1" stroke="#555" stroke-width="1"/>
  </svg>`;
  return div;
}

async function renderHistory() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (!response) {
      historyList.innerHTML = '<div class="loading">No data</div>';
      return;
    }

    const { history, pointer, currentTabId } = response;

    if (history.length === 0) {
      historyList.innerHTML = '<div class="empty-state">No tab history yet.<br>Start switching tabs!</div>';
      historyCount.textContent = '';
      return;
    }

    historyCount.textContent = `${pointer + 1}/${history.length}`;

    // Render newest first (reverse) for readability
    const fragment = document.createDocumentFragment();

    for (let i = history.length - 1; i >= 0; i--) {
      const tab = history[i];
      const isCurrent = i === pointer;

      const item = document.createElement('div');
      item.className = 'history-item' + (isCurrent ? ' is-current' : '');

      const indexEl = document.createElement('div');
      indexEl.className = 'item-index';
      indexEl.textContent = i + 1;

      const favicon = renderFavicon(tab);

      const titleEl = document.createElement('div');
      titleEl.className = 'item-title';
      titleEl.textContent = tab.title || '(untitled)';
      titleEl.title = tab.title || '';

      item.appendChild(indexEl);
      item.appendChild(favicon);
      item.appendChild(titleEl);

      if (isCurrent) {
        const badge = document.createElement('span');
        badge.className = 'current-badge';
        badge.textContent = 'NOW';
        item.appendChild(badge);
      }

      fragment.appendChild(item);
    }

    historyList.innerHTML = '';
    historyList.appendChild(fragment);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadShortcuts();
renderHistory();
