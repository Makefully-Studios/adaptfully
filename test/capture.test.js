import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getRuntimeDir } from '../lib/node/paths.js';
import { STANDARD_PLUGINS } from '../lib/node/registrations.js';

const runtimeDir = getRuntimeDir();

function loadCapturePlugin(pluginKey, extras = {}) {
    const plugin = STANDARD_PLUGINS[pluginKey];
    const context = {
        adaptfully: undefined,
        console,
        window: undefined,
        ...extras,
    };
    context.window = context;

    for (const relative of plugin.scripts) {
        const code = fs.readFileSync(`${runtimeDir}/${relative}`, 'utf8');
        vm.runInNewContext(code, context, { filename: relative });
    }

    vm.runInNewContext(plugin.registration('capture'), context);
    return context.adaptfully.get('capture');
}

describe('capture plugins', () => {
    it('registers webview-capture, electron-capture, and noop-capture', () => {
        assert.ok(STANDARD_PLUGINS['webview-capture']);
        assert.ok(STANDARD_PLUGINS['electron-capture']);
        assert.ok(STANDARD_PLUGINS['noop-capture']);
    });

    it('noop-capture always returns null', async () => {
        const capture = loadCapturePlugin('noop-capture');
        assert.equal(capture.name, 'noop');
        assert.equal(await capture.screenshot(), null);
    });

    it('webview-capture returns null when Capacitor Screenshot is absent', async () => {
        const capture = loadCapturePlugin('webview-capture');
        assert.equal(capture.name, 'webview');
        assert.equal(await capture.screenshot(), null);
    });

    it('webview-capture returns data URL from Capacitor Screenshot.take', async () => {
        const dataUrl = 'data:image/png;base64,abc';
        const capture = loadCapturePlugin('webview-capture', {
            Capacitor: {
                Plugins: {
                    Screenshot: {
                        async take() {
                            return { dataUrl };
                        },
                    },
                },
            },
        });
        assert.equal(await capture.screenshot(), dataUrl);
    });

    it('webview-capture treats unsupported results as null', async () => {
        const capture = loadCapturePlugin('webview-capture', {
            Capacitor: {
                Plugins: {
                    Screenshot: {
                        async take() {
                            return { dataUrl: null, unsupported: true };
                        },
                    },
                },
            },
        });
        assert.equal(await capture.screenshot(), null);
    });

    it('electron-capture returns null when bridge is absent', async () => {
        const capture = loadCapturePlugin('electron-capture');
        assert.equal(capture.name, 'electron');
        assert.equal(await capture.screenshot(), null);
    });

    it('electron-capture returns data URL from __ADAPTFULLY_CAPTURE__', async () => {
        const dataUrl = 'data:image/png;base64,xyz';
        const capture = loadCapturePlugin('electron-capture', {
            __ADAPTFULLY_CAPTURE__: {
                async screenshot() {
                    return dataUrl;
                },
            },
        });
        assert.equal(await capture.screenshot(), dataUrl);
    });
});
