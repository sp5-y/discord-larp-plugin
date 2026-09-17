/**
 * Patch Discord Desktop to load a custom Vencord build.
 *
 * The official VencordInstallerCli with VENCORD_DEV_INSTALL=1 reports Success
 * without actually renaming app.asar (it tries to "download" release assets that
 * were never fetched). This script applies the same on-disk patch the installer
 * is supposed to apply, then verifies it.
 *
 * Usage:
 *   node patch-discord.mjs [--vencord <dir>] [--discord <dir>] [--branch stable]
 */
import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";

function argValue(flag, fallback = "") {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const branch = (argValue("--branch", process.env.DISCORD_BRANCH || "stable") || "stable").toLowerCase();
const branchFolder = {
    stable: "Discord",
    ptb: "DiscordPTB",
    canary: "DiscordCanary",
    auto: "Discord",
}[branch] || "Discord";

const vencordDir = path.resolve(argValue("--vencord", process.env.VENCORD_DIR || path.join(localAppData, "Vencord-custom")));
const discordRoot = path.resolve(argValue("--discord", process.env.DISCORD_LOCATION || path.join(localAppData, branchFolder)));
const patcherJs = path.join(vencordDir, "dist", "patcher.js");

function fail(msg) {
    console.error("[ERROR]", msg);
    process.exit(1);
}

function killDiscord() {
    if (process.env.KEEP_DISCORD_OPEN === "1") return;
    console.log("[..] closing Discord...");
    const names = ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe", "Update.exe"];
    for (const name of names) {
        spawnSync("taskkill", ["/IM", name, "/F"], { stdio: "ignore", windowsHide: true });
    }
    // Give file locks time to drop
    const end = Date.now() + 2500;
    while (Date.now() < end) { /* spin */ }
}

function findResourcesDir(root) {
    if (!fs.existsSync(root)) fail(`Discord folder not found: ${root}`);

    // Allow pointing directly at resources or app-*
    const directResources = path.join(root, "resources");
    if (fs.existsSync(path.join(root, "app.asar")) || fs.existsSync(path.join(root, "_app.asar"))) {
        return root;
    }
    if (fs.existsSync(path.join(directResources, "app.asar")) || fs.existsSync(path.join(directResources, "_app.asar"))) {
        return directResources;
    }

    const apps = fs.readdirSync(root)
        .filter(n => n.startsWith("app-"))
        .map(n => ({ name: n, full: path.join(root, n, "resources") }))
        .filter(x => fs.existsSync(x.full))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

    if (!apps.length) fail(`No Discord app-*\\resources found under ${root}`);
    return apps[0].full;
}

/** Minimal Electron asar with index.js + package.json (same idea as Vencord Installer). */
function writeStubAsar(outFile, patcherPath) {
    const packageJson = '{\n  "name": "discord",\n  "main": "index.js"\n}';
    const indexJs = `require(${JSON.stringify(patcherPath)})`;

    const files = {};
    let contents = Buffer.alloc(0);
    for (const [name, text] of [["index.js", indexJs], ["package.json", packageJson]]) {
        const data = Buffer.from(text, "utf8");
        files[name] = { size: data.length, offset: String(contents.length) };
        contents = Buffer.concat([contents, data]);
    }

    let header = Buffer.from(JSON.stringify({ files }), "utf8");
    const headerStringSize = header.length;
    const dataSize = 4;
    const alignedSize = (headerStringSize + dataSize - 1) & ~(dataSize - 1);
    const headerSize = alignedSize + 8;
    const headerObjectSize = alignedSize + dataSize;
    const diff = alignedSize - headerStringSize;
    if (diff > 0) header = Buffer.concat([header, Buffer.alloc(diff, 0x30)]); // '0' padding like installer

    const fd = fs.openSync(outFile, "w");
    try {
        const u32 = Buffer.alloc(4);
        for (const n of [dataSize, headerSize, headerObjectSize, headerStringSize]) {
            u32.writeUInt32LE(n, 0);
            fs.writeSync(fd, u32);
        }
        fs.writeSync(fd, header);
        fs.writeSync(fd, contents);
    } finally {
        fs.closeSync(fd);
    }
}

function isPatched(resourcesDir) {
    const backup = path.join(resourcesDir, "_app.asar");
    const stub = path.join(resourcesDir, "app.asar");
    if (!fs.existsSync(backup) || !fs.existsSync(stub)) return false;
    try {
        const buf = fs.readFileSync(stub);
        return buf.includes(Buffer.from("patcher.js")) && buf.length < 4096;
    } catch {
        return false;
    }
}

function patch(resourcesDir) {
    const appAsar = path.join(resourcesDir, "app.asar");
    const backup = path.join(resourcesDir, "_app.asar");
    const appDir = path.join(resourcesDir, "app");

    if (fs.existsSync(appDir)) {
        console.log("[..] removing leftover resources\\app folder");
        fs.rmSync(appDir, { recursive: true, force: true });
    }

    if (!fs.existsSync(backup)) {
        if (!fs.existsSync(appAsar)) fail(`Missing app.asar in ${resourcesDir}`);
        const size = fs.statSync(appAsar).size;
        if (size < 4096) {
            fail(`Found a tiny app.asar but no _app.asar backup.\nReinstall Discord, then run this again.`);
        }
        console.log(`[..] backing up app.asar (${size} bytes) -> _app.asar`);
        fs.renameSync(appAsar, backup);
    } else {
        console.log("[..] _app.asar backup already present");
        if (fs.existsSync(appAsar)) {
            try { fs.unlinkSync(appAsar); } catch (e) {
                fail(`Could not replace app.asar (is Discord still open?): ${e.message}`);
            }
        }
    }

    console.log("[..] writing Vencord stub app.asar");
    console.log("     patcher:", patcherJs);
    writeStubAsar(appAsar, patcherJs);
}

function verify(resourcesDir) {
    const backup = path.join(resourcesDir, "_app.asar");
    const stub = path.join(resourcesDir, "app.asar");
    if (!fs.existsSync(backup)) fail("Verify failed: _app.asar missing");
    if (!fs.existsSync(stub)) fail("Verify failed: app.asar missing");
    const stubBuf = fs.readFileSync(stub);
    if (stubBuf.length > 8192) fail(`Verify failed: app.asar looks like stock Discord (${stubBuf.length} bytes)`);
    if (!stubBuf.includes(Buffer.from("patcher"))) fail("Verify failed: stub does not reference patcher.js");
    // Accept either absolute path or just presence of our dist folder name
    const needle = Buffer.from(patcherJs.replace(/\//g, "\\"));
    const needleAlt = Buffer.from(patcherJs);
    if (!stubBuf.includes(needle) && !stubBuf.includes(needleAlt) && !stubBuf.includes(Buffer.from("patcher.js"))) {
        fail("Verify failed: stub does not point at custom patcher");
    }
    console.log("[OK] Discord is patched");
    console.log("     resources:", resourcesDir);
    console.log("     stub size:", stubBuf.length, "bytes");
    console.log("     backup:   ", backup, `(${fs.statSync(backup).size} bytes)`);
}

console.log("============================================================");
console.log("  Larp Tool - patch Discord for custom Vencord");
console.log("============================================================");
console.log("  Vencord:", vencordDir);
console.log("  Discord:", discordRoot);
console.log("  Branch: ", branch);
console.log("============================================================");

if (!fs.existsSync(patcherJs)) {
    fail(`Missing ${patcherJs}\nBuild Vencord first (auto-setup.bat rebuild).`);
}

killDiscord();
const resourcesDir = findResourcesDir(discordRoot);
console.log("[..] target resources:", resourcesDir);

if (isPatched(resourcesDir)) {
    console.log("[..] already patched — refreshing stub to current build");
}
patch(resourcesDir);
verify(resourcesDir);
console.log("[OK] Fully quit Discord (tray too), then reopen it.");
console.log("     Settings should show a Vencord section.");
