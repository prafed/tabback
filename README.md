# TabBack

A Chrome extension that gives you browser-style back/forward navigation for your tabs.

## What it does

Chrome doesn't have a concept of tab visit history — if you're deep in a multi-tab workflow and want to retrace your steps, you're out of luck. TabBack fixes that.

It tracks the order you visit tabs and lets you navigate through that history with keyboard shortcuts, exactly like browser back/forward but for tabs.


## Behaviour

- History is per-window, up to 50 entries
- Clicking a tab manually while mid-history truncates forward history and appends the new visit (same model as browser navigation)
- Hotkey navigation moves a pointer through history — it does not create new history entries
- Closing a tab removes it from history; pointer adjusts accordingly
- History is cleared when the browser closes (uses session storage)

## Installation

### From Chrome Web Store

_Coming soon._

### Manual (Developer Mode)

1. Clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the repo folder

## Keyboard Shortcuts

Default bindings — designed to be used **one-handed** (left hand) while keeping your right hand on the mouse:

| Action | Shortcut |
|--------|----------|
| Navigate Back | `Alt+A` |
| Navigate Forward | `Alt+S` |

`A` and `S` sit on the home row, reachable with no stretch.

To change: open `chrome://extensions/shortcuts` or click the settings icon in the popup.

**Per-OS recommendations if you want to rebind:**

| OS | Back | Forward |
|----|------|---------|
| Mac | `Cmd+Shift+[` | `Cmd+Shift+]` |
| Windows / Linux | `Alt+Shift+Left` | `Alt+Shift+Right` |

> Avoid `Ctrl+Shift+W` (Windows) and `Cmd+Shift+W` (Mac) — both close the current tab.

## Permissions

- `tabs` — required to detect tab switches and read tab titles/favicons for the popup
- `storage` — persists history across service worker restarts within a session

No network access. No data leaves your browser.

## Development

```
tabback/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js   # Service worker — history tracking + hotkey handling
    ├── popup.html
    ├── popup.css
    └── popup.js
```

No build step. Load the repo root as an unpacked extension.

## Contributing

PRs welcome. Keep it dependency-free and no build tooling — this should stay simple.

## License

MIT
