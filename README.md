# Discord Larp Tool

A [Vencord](https://github.com/Vendicated/Vencord) userplugin that customizes how **your own** profile looks visually.

<p align="center">
  <img src="./assets/prev.png" width="48%" alt="Larp Tool manager" />
  <img src="./assets/prev2.png" width="48%" alt="Profile preview" />
</p>

## Features

- **Add / hide badges** — including Nitro tiers, boosts, and gifting badges
- **Custom `@username`** — spoof your handle in profile, settings, and messages
- **Member Since** — spoof your account join date (`YYYY-MM-DD`)
- **Decorations** — avatar decorations, profile effects (banner tab), nameplates
- **Connections** — rename, hide, or add fake linked accounts

## Requirements

- [Discord Desktop](https://discord.com/download)
- [Git](https://git-scm.com/download/win)
- [Node.js](https://nodejs.org/) (LTS)

## Quick setup

```bat
auto-setup.bat
```

Then **fully restart Discord** (tray icon too). Press **Ctrl+B** to open the tool.

| Command | What it does |
|---|---|
| `auto-setup.bat` | Clone/update Vencord, build, patch Discord |
| `auto-setup.bat rebuild` | Copy plugin + rebuild only (no patch) |
| `auto-setup.bat inject` | Rebuild + patch Discord |

```bat
set DISCORD_BRANCH=stable
set DISCORD_LOCATION=C:\path\to\Discord
set VENCORD_DIR=C:\path\to\Vencord
set NOINJECT=1
```

## FAQ / troubleshooting

### Setup stuck on “enabling pnpm via corepack…”
That means it is **not done** — corepack was hanging. Newer `auto-setup.bat` installs pnpm with `npm install -g pnpm@9` instead.

If it still hangs:
1. Close the window
2. Open a terminal and run: `npm install -g pnpm@9`
3. Run `auto-setup.bat inject` again

You are done only when you see **`Done!`** and get a `Press any key` prompt.

### Banner decorations not working
The **Banner** tab equips Discord **profile effects** (animated overlay), not a custom banner image.

After this update, effects only apply once Discord has a valid effect instance (so they no longer crash your profile). Equip again from Decorations → Banner, wait a second for the product to load, then reopen your profile.

### Profile crashes when I open it
Usually caused by an incomplete profile effect. Update + inject, then:
1. Decorations → Banner → **Remove**
2. Restart Discord
3. Re-equip the effect if you still want it

### Vencord told me to delete the Discord folder and nothing came back
Deleting `%LOCALAPPDATA%\Discord` wipes the install. Fix:

1. Download Discord again from [discord.com/download](https://discord.com/download) and install it
2. Let it finish updating once
3. Fully close Discord
4. Run `auto-setup.bat inject`
5. Open Discord → Vencord Settings → enable **Larp Tool**

Do **not** delete `%APPDATA%\discord` unless you want to wipe login/settings too.

### Discord uses a lot of memory
This plugin now:
- Debounces profile refreshes
- Stops registering every shop item into memory while browsing
- Throttles the badge-hide DOM observer
- Preloads fewer decoration images

Discord itself is still heavy; the plugin should no longer pile on as much.

## Usage

| Tab | What it does |
|---|---|
| **Username** | Custom `@username` + Member Since date |
| **Badges** | Search, hide owned badges, add fake ones |
| **Decorations** | Avatar / Banner (profile effect) / Nameplate |
| **Connections** | Override, hide, or add linked accounts |
| **Credits** | About |

**Reset** (gray, left) clears everything. **Close** (blue, right) closes the modal.

## Disclaimer

Client-side only. Nothing is sent to Discord’s servers. Only you see the changes. Unofficial — see [Vencord custom plugins](https://docs.vencord.dev/installing/custom-plugins/).

---

made by [sp5](https://github.com/sp5-y/discord-larp-plugin)
