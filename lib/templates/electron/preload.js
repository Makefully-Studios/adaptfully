/* global require */
const { contextBridge } = require('electron');

let steamClient = null;

try {
    steamClient = require('steamworks.js').init({{STEAM_APP_ID}});
} catch (err) {
    console.error('Steamworks init failed:', err);
}

if (steamClient) {
    contextBridge.exposeInMainWorld('__ADAPTFULLY_STEAMWORKS__', steamClient);
}
