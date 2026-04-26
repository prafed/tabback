/**
 * TabBack - Background Service Worker
 *
 * State shape (per window, stored in memory):
 * {
 *   [windowId]: {
 *     history: [tabId, tabId, ...],  // max 50 entries
 *     pointer: number                 // index into history
 *   }
 * }
 *
 * Rules:
 * - Manual tab activation: truncate forward history, append, cap at 50
 * - Hotkey back/forward: move pointer only, no history mutation
 * - Tab closed: remove all occurrences, adjust pointer
 * - Window closed: delete window state
 * - Hotkey-driven activations must NOT trigger history recording
 */

const MAX_HISTORY = 50;

// In-memory state. Service workers can be killed; we persist to session storage.
let windowHistories = {};
let isHotkeyNavigation = false;

// ─── Persistence ─────────────────────────────────────────────────────────────

async function loadState() {
  const result = await chrome.storage.session.get('windowHistories');
  windowHistories = result.windowHistories || {};
}

async function saveState() {
  await chrome.storage.session.set({ windowHistories });
}

// ─── State Helpers ────────────────────────────────────────────────────────────

function getWindowState(windowId) {
  if (!windowHistories[windowId]) {
    windowHistories[windowId] = { history: [], pointer: -1 };
  }
  return windowHistories[windowId];
}

function deleteWindowState(windowId) {
  delete windowHistories[windowId];
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

function recordTabVisit(windowId, tabId) {
  const state = getWindowState(windowId);

  // Truncate anything forward of current pointer
  state.history = state.history.slice(0, state.pointer + 1);

  // Don't record the same tab twice in a row
  if (state.history[state.pointer] === tabId) {
    return;
  }

  state.history.push(tabId);

  // Cap at MAX_HISTORY — drop oldest
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }

  state.pointer = state.history.length - 1;
}

async function navigateBack(windowId) {
  const state = getWindowState(windowId);
  if (state.pointer <= 0) return; // Already at oldest

  state.pointer--;
  const targetTabId = state.history[state.pointer];

  isHotkeyNavigation = true;
  try {
    await chrome.tabs.update(targetTabId, { active: true });
  } catch (e) {
    // Tab no longer exists — remove it and try again
    handleClosedTab(windowId, targetTabId);
    await navigateBack(windowId);
    return;
  } finally {
    // Reset flag after a tick to ensure onActivated fires first
    setTimeout(() => { isHotkeyNavigation = false; }, 50);
  }

  await saveState();
}

async function navigateForward(windowId) {
  const state = getWindowState(windowId);
  if (state.pointer >= state.history.length - 1) return; // Already at newest

  state.pointer++;
  const targetTabId = state.history[state.pointer];

  isHotkeyNavigation = true;
  try {
    await chrome.tabs.update(targetTabId, { active: true });
  } catch (e) {
    handleClosedTab(windowId, targetTabId);
    await navigateForward(windowId);
    return;
  } finally {
    setTimeout(() => { isHotkeyNavigation = false; }, 50);
  }

  await saveState();
}

function handleClosedTab(windowId, closedTabId) {
  const state = getWindowState(windowId);
  const oldPointer = state.pointer;
  const oldHistory = state.history;

  // Remove all occurrences of the closed tab
  state.history = oldHistory.filter(id => id !== closedTabId);

  // Recalculate pointer proportionally
  // Count how many removed entries were at or before the old pointer
  let removedBeforeOrAt = 0;
  for (let i = 0; i <= oldPointer && i < oldHistory.length; i++) {
    if (oldHistory[i] === closedTabId) removedBeforeOrAt++;
  }

  state.pointer = Math.max(0, oldPointer - removedBeforeOrAt);

  // If history is now empty, reset
  if (state.history.length === 0) {
    state.pointer = -1;
  } else {
    state.pointer = Math.min(state.pointer, state.history.length - 1);
  }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await loadState(); // Refresh in case service worker was restarted

  if (isHotkeyNavigation) return; // Ignore hotkey-driven activations

  recordTabVisit(activeInfo.windowId, activeInfo.tabId);
  await saveState();
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await loadState();

  if (removeInfo.isWindowClosing) {
    deleteWindowState(removeInfo.windowId);
  } else {
    handleClosedTab(removeInfo.windowId, tabId);
  }

  await saveState();
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  await loadState();
  deleteWindowState(windowId);
  await saveState();
});

chrome.commands.onCommand.addListener(async (command) => {
  await loadState();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === 'navigate-back') {
    await navigateBack(tab.windowId);
  } else if (command === 'navigate-forward') {
    await navigateForward(tab.windowId);
  }
});

// ─── Message Handler (for popup) ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    loadState().then(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        sendResponse({ history: [], pointer: -1 });
        return;
      }
      const state = getWindowState(tab.windowId);

      // Resolve tab IDs to tab objects for display
      const tabIds = [...new Set(state.history)];
      const tabInfoMap = {};
      await Promise.all(tabIds.map(async (id) => {
        try {
          const t = await chrome.tabs.get(id);
          tabInfoMap[id] = { title: t.title, favIconUrl: t.favIconUrl, id: t.id };
        } catch {
          tabInfoMap[id] = { title: '(closed)', favIconUrl: null, id };
        }
      }));

      sendResponse({
        history: state.history.map(id => tabInfoMap[id] || { title: '(unknown)', id }),
        pointer: state.pointer,
        currentTabId: tab.id
      });
    });
    return true; // Keep message channel open for async response
  }
});

// Initialise on install/startup
chrome.runtime.onInstalled.addListener(loadState);
chrome.runtime.onStartup.addListener(loadState);
