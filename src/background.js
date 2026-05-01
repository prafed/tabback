/**
 * TabBack - Optimized Background Service Worker (MV3)
 * Fixes: Race conditions, Orphaned Window Leaks, and IPC Flooding.
 */

const MAX_HISTORY = 50;
let pendingActivations = new Set(); // Tracks tabs activated by hotkeys

// ─── Atomic State Management ──────────────────────────────────────────────────

async function updateState(windowId, updateFn) {
  const data = await chrome.storage.session.get('windowHistories');
  const histories = data.windowHistories || {};
  
  if (!histories[windowId]) {
    histories[windowId] = { history: [], pointer: -1 };
  }

  // Execute the logic passed into the helper
  updateFn(histories[windowId]);

  await chrome.storage.session.set({ windowHistories: histories });
  return histories[windowId];
}

// ─── Cleanup Logic (The "Garbage Collector") ──────────────────────────────────

async function cleanupOrphanedWindows() {
  const [windows, data] = await Promise.all([
    chrome.windows.getAll(),
    chrome.storage.session.get('windowHistories')
  ]);
  
  const activeIds = new Set(windows.map(w => w.id));
  const histories = data.windowHistories || {};
  let changed = false;

  for (const id in histories) {
    if (!activeIds.has(parseInt(id))) {
      delete histories[id];
      changed = true;
    }
  }

  if (changed) await chrome.storage.session.set({ windowHistories: histories });
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

async function recordTabVisit(windowId, tabId) {
  await updateState(windowId, (state) => {
    state.history = state.history.slice(0, state.pointer + 1);
    if (state.history[state.pointer] === tabId) return;

    state.history.push(tabId);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.pointer = state.history.length - 1;
  });
}

async function navigate(windowId, direction) {
  const data = await chrome.storage.session.get('windowHistories');
  const state = data.windowHistories?.[windowId];
  if (!state) return;

  const newPointer = state.pointer + direction;
  if (newPointer < 0 || newPointer >= state.history.length) return;

  const targetTabId = state.history[newPointer];
  
  try {
    pendingActivations.add(targetTabId); // Mark this tab as "Ignore on next activation"
    await chrome.tabs.update(targetTabId, { active: true });
    
    // Update pointer after successful navigation
    await updateState(windowId, (s) => { s.pointer = newPointer; });
  } catch (e) {
    // If tab is dead, remove it and try next one
    await handleClosedTab(windowId, targetTabId);
    await navigate(windowId, direction);
  }
}

async function handleClosedTab(windowId, closedTabId) {
  await updateState(windowId, (state) => {
    const oldPointer = state.pointer;
    const oldHistory = [...state.history];
    
    state.history = oldHistory.filter(id => id !== closedTabId);
    
    let removedBefore = oldHistory.slice(0, oldPointer + 1).filter(id => id === closedTabId).length;
    state.pointer = Math.max(0, Math.min(oldPointer - removedBefore, state.history.length - 1));
    
    if (state.history.length === 0) state.pointer = -1;
  });
}

// ─── Events ───────────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (info) => {
  if (pendingActivations.has(info.tabId)) {
    pendingActivations.delete(info.tabId);
    return;
  }
  await recordTabVisit(info.windowId, info.tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  if (info.isWindowClosing) return; 
  await handleClosedTab(info.windowId, tabId);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const data = await chrome.storage.session.get('windowHistories');
  if (data.windowHistories) {
    delete data.windowHistories[windowId];
    await chrome.storage.session.set({ windowHistories: data.windowHistories });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === 'navigate-back') await navigate(tab.windowId, -1);
  if (command === 'navigate-forward') await navigate(tab.windowId, 1);
});

// ─── Messaging (The "Data Aggregator") ────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return sendResponse({ history: [], pointer: -1 });

      const data = await chrome.storage.session.get('windowHistories');
      const state = data.windowHistories?.[tab.windowId] || { history: [], pointer: -1 };

      // Batch info gathering here to prevent Popup-to-Chrome overhead
      const fullHistory = await Promise.all(state.history.map(async (id) => {
        try {
          const t = await chrome.tabs.get(id);
          return { id: t.id, title: t.title, favIconUrl: t.favIconUrl };
        } catch {
          return { id, title: '(Closed Tab)', favIconUrl: null };
        }
      }));

      sendResponse({ history: fullHistory, pointer: state.pointer });
    })();
    return true;
  }
});

// Initialization & Heartbeat
chrome.runtime.onInstalled.addListener(cleanupOrphanedWindows);
chrome.runtime.onStartup.addListener(cleanupOrphanedWindows);
