import fs from 'node:fs';
import path from 'node:path';
import { Packager } from './base.js';
import { resolvePlatformConfig } from '../platform-config.js';
import { resolveRuntimeScript } from '../paths.js';

const EOS_ID_FIELDS = ['eosProductId', 'eosSandboxId', 'eosDeploymentId', 'eosClientId'];

const STEAM_INIT = `const path = require('path');

try {
    require('steamworks.js').electronEnableSteamOverlay();
} catch (err) {
    console.error('Steam overlay unavailable:', err);
}
`;

const PRELOAD_LINE = `,
                preload: path.join(__dirname, 'preload.js')`;

const CAPTURE_IPC = `
ipcMain.handle('adaptfully:capture-page', async (event) => {
    const image = await event.sender.capturePage();
    return image.toDataURL();
});
`;

const ELECTRON_MAIN_HEAD_BASE = `/* eslint-disable no-sync */
/* global process, require */
const
    {app, shell, BrowserWindow, Menu__IPC_IMPORT__} = require('electron'),
    fs = require('fs');

`;

const ELECTRON_MAIN_BODY = `
/**
 * Opens http(s) links in the system browser; allows same-app file:// navigation.
 * @param {Electron.BrowserWindow} win
 */
function attachExternalLinkHandlers(win) {
    win.webContents.setWindowOpenHandler(({url}) => {
        if (url.startsWith('file:')) {
            return {action: 'deny'};
        }
        shell.openExternal(url);
        return {action: 'deny'};
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('file:')) {
            return;
        }
        event.preventDefault();
        shell.openExternal(url);
    });
}

/**
 * Creates window.
 */
function createWindow () {
    // Create the browser window.
    const
        debugMode = false,
        lastState = (function () {
            let state = null;

            try {
                state = JSON.parse(fs.readFileSync(app.getPath('userData') + '/window-state.json', 'utf8'));
            } catch (e) {}

            return state || {
                bounds: {
                    width: 800,
                    height: 600
                },
                maximized: false,
                fullscreen: false
            };
        })(),
        win = new BrowserWindow({
            backgroundColor: __THEME_COLOR__,
            width: lastState.bounds.width,
            height: lastState.bounds.height,
            minWidth: 200,
            minHeight: 100,
            webPreferences: {
                devTools: debugMode,
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: __SANDBOX__`;

const ELECTRON_MAIN_TAIL = `
            },
            show: false
        });

    if (lastState.maximized) {
        win.maximize();
    }
    if (lastState.fullscreen) {
        win.setFullScreen(true);
    }

    if (!debugMode) {
        Menu.setApplicationMenu(null);
    }

    win.once('ready-to-show', () => { // helps prevent flicker-loading
        win.show();
    });

    // and load the index.html of the app.
    win.loadFile('index.html');

    attachExternalLinkHandlers(win);

    //win.webContents.openDevTools();

    win.on('close', () => {
        fs.writeFileSync(app.getPath('userData') + '/window-state.json', JSON.stringify({
            bounds: win.getNormalBounds(),
            maximized: win.isMaximized(),
            fullscreen: win.isFullScreen()
        }));
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
`;

const CAPTURE_PRELOAD = `
contextBridge.exposeInMainWorld('__ADAPTFULLY_CAPTURE__', {
    screenshot: () => ipcRenderer.invoke('adaptfully:capture-page'),
});
`;

/**
 * @param {string | null | undefined} platformKey
 * @param {{ config?: { platforms?: Record<string, Record<string, unknown>> } }} pkg
 * @returns {string[]}
 */
export function missingEosIdFields(platformKey, pkg) {
    const platform = platformKey ? pkg.config?.platforms?.[platformKey] : null;
    if (!platform) {
        return [...EOS_ID_FIELDS];
    }

    return EOS_ID_FIELDS.filter((key) => {
        const value = platform[key];
        return value == null || String(value).trim() === '';
    });
}

/**
 * EOS SDK ids baked into the Electron main process. Not BPT upload credentials.
 * @param {string | null | undefined} platformKey
 * @param {{ config?: { platforms?: Record<string, Record<string, unknown>> } }} pkg
 */
export function resolvePlatformEosConfig(platformKey, pkg) {
    const platform = platformKey ? pkg.config?.platforms?.[platformKey] : null;
    if (!platform) {
        return null;
    }

    return {
        productId: String(platform.eosProductId ?? ''),
        sandboxId: String(platform.eosSandboxId ?? ''),
        deploymentId: String(platform.eosDeploymentId ?? ''),
        clientId: String(platform.eosClientId ?? ''),
        devAuth: String(platformKey).endsWith('-dev'),
        devAuthHost: '127.0.0.1:6300',
        devAuthCredential: 'adaptfully',
    };
}

/**
 * @param {{ withSteam?: boolean, withCapture?: boolean, withEos?: boolean, eosConfig?: object }} [options]
 * @param {string} [themeColor]
 */
export function buildElectronMain(options = {}, themeColor) {
    // Back-compat: buildElectronMain(withSteam, themeColor)
    let withSteam;
    let withCapture;
    let withEos;
    let eosConfig;
    let color = themeColor;

    if (typeof options === 'boolean') {
        withSteam = options;
        withCapture = false;
        withEos = false;
    } else {
        withSteam = options.withSteam === true;
        withCapture = options.withCapture === true;
        withEos = options.withEos === true;
        eosConfig = options.eosConfig;
        color = themeColor ?? options.themeColor;
    }

    const needsPreload = withSteam || withCapture || withEos;
    const steamInit = withSteam ? STEAM_INIT : '';
    const eosInit = withEos
        ? `const eosBridge = require('./eos-bridge.cjs');\neosBridge.install(${JSON.stringify(eosConfig || {})});\n`
        : '';
    const preloadLine = needsPreload ? PRELOAD_LINE : '';
    // steamworks.js and the EOS bridge need an unsandboxed preload; capture-only stays sandboxed.
    const sandbox = (withSteam || withEos) ? 'false' : 'true';
    const head = ELECTRON_MAIN_HEAD_BASE.replace(
        '__IPC_IMPORT__',
        withCapture ? ', ipcMain' : '',
    );
    const captureIpc = withCapture ? CAPTURE_IPC : '';
    const mainBody = ELECTRON_MAIN_BODY
        .replace('__SANDBOX__', sandbox)
        .replace('__THEME_COLOR__', String(JSON.stringify(color)));

    return head + steamInit + eosInit + captureIpc + mainBody + preloadLine + ELECTRON_MAIN_TAIL;
}

/**
 * @param {{ steamAppId?: number | string, withSteam?: boolean, withCapture?: boolean, withEos?: boolean }} options
 */
export function buildElectronPreload(options = {}) {
    // Back-compat: buildElectronPreload(steamAppId)
    if (typeof options === 'number' || typeof options === 'string') {
        options = { steamAppId: options, withSteam: true, withCapture: false };
    }

    const withSteam = options.withSteam === true || options.steamAppId != null;
    const withCapture = options.withCapture === true;
    const withEos = options.withEos === true;
    const steamAppId = options.steamAppId;
    const needsIpc = withCapture || withEos;

    const lines = [
        '/* global require */',
        needsIpc
            ? "const { contextBridge, ipcRenderer } = require('electron');"
            : "const { contextBridge } = require('electron');",
        '',
    ];

    if (withSteam) {
        lines.push(
            'let steamClient = null;',
            '',
            'try {',
            `    steamClient = require('steamworks.js').init(${steamAppId});`,
            '} catch (err) {',
            "    console.error('Steamworks init failed:', err);",
            '}',
            '',
            'if (steamClient) {',
            "    contextBridge.exposeInMainWorld('__ADAPTFULLY_STEAMWORKS__', steamClient);",
            '}',
            '',
        );
    }

    if (withEos) {
        lines.push(
            "contextBridge.exposeInMainWorld('__ADAPTFULLY_EOS__', {",
            "    getIdentity: () => ipcRenderer.invoke('adaptfully:eos-identity'),",
            "    login: () => ipcRenderer.invoke('adaptfully:eos-login'),",
            "    getExchangeCode: () => ipcRenderer.invoke('adaptfully:eos-exchange-code'),",
            '});',
            '',
        );
    }

    if (withCapture) {
        lines.push(CAPTURE_PRELOAD.trim(), '');
    }

    return `${lines.join('\n')}\n`;
}

/**
 * Steamworks app ID for steam-auth preload, from the active platform config.
 * @param {string | null | undefined} platformKey
 * @param {{ config?: { platforms?: Record<string, { steamId?: number | string }> } }} pkg
 * @returns {number | string | undefined}
 */
export function resolvePlatformSteamId(platformKey, pkg) {
    if (!platformKey) {
        return undefined;
    }
    return pkg.config?.platforms?.[platformKey]?.steamId;
}

export class ElectronPackager extends Packager {
    /** @type {'electron'} */
    static id = 'electron';

    /** @type {string[]} */
    static defaultPlatforms = ['steam'];

    validate() {
        super.validate();

        if (this.usesPlugin('steam-auth') && !resolvePlatformSteamId(this.platformKey, this.pkg)) {
            const platformLabel = this.platformKey ?? this.platforms.join(', ');
            throw new Error(
                `Platform "${platformLabel}" uses steam-auth but platforms.${platformLabel}.steamId is not set.`,
            );
        }

        if (this.usesPlugin('epic-auth')) {
            const missing = missingEosIdFields(this.platformKey, this.pkg);
            if (missing.length) {
                const platformLabel = this.platformKey ?? this.platforms.join(', ');
                throw new Error(
                    `Platform "${platformLabel}" uses epic-auth but is missing ${missing.join(', ')}.`,
                );
            }
        }
    }

    needsGameConfig() {
        return true;
    }

    /** @param {string} dest */
    applyTemplates(dest) {
        this.writeElectronMain(dest);
        super.applyTemplates(dest);
    }

    /** @param {string} dest */
    writeElectronMain(dest) {
        const withSteam = this.usesPlugin('steam-auth');
        const withCapture = this.usesPlugin('electron-capture');
        const withEos = this.usesPlugin('epic-auth');
        const config = resolvePlatformConfig(this.pkg, this.platformKey);
        const eosConfig = withEos
            ? resolvePlatformEosConfig(this.platformKey, this.pkg)
            : undefined;
        const mainContent = buildElectronMain(
            { withSteam, withCapture, withEos, eosConfig, themeColor: config.themeColor },
        );

        if (withEos) {
            fs.copyFileSync(
                resolveRuntimeScript('electron/eos-bridge.cjs'),
                path.join(dest, 'eos-bridge.cjs'),
            );
            this.log('adaptfully: write eos-bridge.cjs (epic-auth)');
        }

        if (withSteam || withCapture || withEos) {
            const steamId = withSteam
                ? resolvePlatformSteamId(this.platformKey, this.pkg)
                : undefined;
            fs.writeFileSync(
                path.join(dest, 'preload.js'),
                buildElectronPreload({
                    withSteam,
                    withCapture,
                    withEos,
                    steamAppId: steamId,
                }),
            );
            const reasons = [
                withSteam ? 'steam-auth' : null,
                withEos ? 'epic-auth' : null,
                withCapture ? 'electron-capture' : null,
            ].filter(Boolean).join('+');
            this.log(`adaptfully: write preload.js (${reasons})`);
        }

        fs.writeFileSync(path.join(dest, 'main.js'), mainContent);
        this.log('adaptfully: write main.js (electron)');
    }
}
