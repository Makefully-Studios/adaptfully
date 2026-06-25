import fs from 'node:fs';
import path from 'node:path';
import { Packager } from './base.js';

const STEAM_INIT = `const path = require('path');

try {
    require('steamworks.js').electronEnableSteamOverlay();
} catch (err) {
    console.error('Steam overlay unavailable:', err);
}
`;

const STEAM_PRELOAD = `,
                preload: path.join(__dirname, 'preload.js')`;

const ELECTRON_MAIN_HEAD = `/* eslint-disable no-sync */
/* global process, require */
const
    {app, shell, BrowserWindow, Menu} = require('electron'),
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
            backgroundColor: '#E4378E',
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

const ELECTRON_PRELOAD_HEAD = `/* global require */
const { contextBridge } = require('electron');

let steamClient = null;

try {
    steamClient = require('steamworks.js').init(`;

const ELECTRON_PRELOAD_TAIL = `);
} catch (err) {
    console.error('Steamworks init failed:', err);
}

if (steamClient) {
    contextBridge.exposeInMainWorld('__ADAPTFULLY_STEAMWORKS__', steamClient);
}
`;

/**
 * @param {boolean} withSteam
 */
export function buildElectronMain(withSteam) {
    const steamInit = withSteam ? STEAM_INIT : '';
    const steamPreload = withSteam ? STEAM_PRELOAD : '';
    const sandbox = withSteam ? 'false' : 'true';
    const mainBody = ELECTRON_MAIN_BODY.replace('__SANDBOX__', sandbox);
    return ELECTRON_MAIN_HEAD + steamInit + mainBody + steamPreload + ELECTRON_MAIN_TAIL;
}

/**
 * @param {number | string} steamAppId
 */
export function buildElectronPreload(steamAppId) {
    return ELECTRON_PRELOAD_HEAD + steamAppId + ELECTRON_PRELOAD_TAIL;
}

export class ElectronPackager extends Packager {
    /** @type {'electron'} */
    static id = 'electron';

    /** @type {string[]} */
    static defaultPlatforms = ['steam'];

    validate() {
        super.validate();

        if (this.usesPlugin('steam-auth') && !this.pkg.config?.steamId) {
            const platformLabel = this.platformKey ?? this.platforms.join(', ');
            throw new Error(
                `Platform "${platformLabel}" uses steam-auth but config.steamId is not set.`,
            );
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
        const mainContent = buildElectronMain(withSteam);

        if (withSteam) {
            fs.writeFileSync(
                path.join(dest, 'preload.js'),
                buildElectronPreload(this.pkg.config.steamId),
            );
            this.log('adaptfully: write preload.js (steam-auth)');
        }

        fs.writeFileSync(path.join(dest, 'main.js'), mainContent);
        this.log('adaptfully: write main.js (electron)');
    }
}
