# Discord Larp Tool (Vencord plugin)

A [Vencord](https://github.com/Vendicated/Vencord) userplugin that lets you customize how **your own** profile looks locally — badges, `@username`, and connected accounts.

**Client-side only.** Nothing is sent to Discord's servers. Only you see the changes.

## Features

- **Add badges** — show badges you don't actually have (Staff, Nitro tiers, HypeSquad, etc.)
- **Hide badges** — toggle off badges you do have
- **Custom `@username`** — display a different handle in the UI
- **Connection overrides** — rename linked accounts on your profile
- **Badge manager UI** — press **Ctrl+B** or use the button in plugin settings

## Requirements

- [Discord Desktop](https://discord.com/download) (patched with a custom Vencord build)
- [Git](https://git-scm.com/download/win)
- [Node.js](https://nodejs.org/) (includes `corepack` for pnpm)

## Quick setup (Windows)

Run the included script from this folder:

```bat
auto-setup.bat
```

This will:

1. Clone Vencord to `%LOCALAPPDATA%\Vencord-custom`
2. Copy `larp/index.tsx` into Vencord's `src/userplugins/larp/`
3. Install dependencies and build
4. Launch the Vencord installer (`pnpm inject`) — pick your Discord install in the GUI

Then restart Discord, open **Vencord Settings → Plugins**, and enable **Larp Tool**.

### Script commands

| Command | Description |
|---|---|
| `auto-setup.bat` | Full first-time setup |
| `auto-setup.bat rebuild` | Copy plugin + rebuild after edits |
| `auto-setup.bat inject` | Rebuild + re-patch Discord |
| `auto-setup.bat help` | Show options |

**Optional env vars:**

```bat
set VENCORD_DIR=C:\path\to\Vencord
set NOINJECT=1
auto-setup.bat
```

## Manual setup

If you prefer to do it yourself, follow the [Vencord custom plugins guide](https://docs.vencord.dev/installing/custom-plugins/):

1. [Build Vencord from source](https://docs.vencord.dev/installing/#building-vencord)
2. Create `src/userplugins/larp/` in your Vencord folder
3. Copy `larp/index.tsx` into that folder
4. Run `pnpm build` and `pnpm inject`
5. Restart Discord and enable the plugin

## Usage

1. Enable **Larp Tool** in Vencord plugin settings
2. Press **Ctrl+B** to open the manager (or click **Open Larp Tool** in settings)
3. Toggle badges, set a custom username, or edit connection names
4. Use **Reset** in the modal to clear all overrides

## Project structure

```
discordlarp/
├── auto-setup.bat    # Automated Vencord build + install
├── larp/
│   └── index.tsx     # Vencord userplugin source
└── README.md
```

## Disclaimer

This is a custom Vencord userplugin for local UI customization. You are responsible for your own install. Vencord does not officially support custom plugins — see their [custom plugins docs](https://docs.vencord.dev/installing/custom-plugins/) for details.
