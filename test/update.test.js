import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getRuntimeDir } from '../lib/node/paths.js';
import { resolveRegistrationAssets, STANDARD_PLUGINS } from '../lib/node/registrations.js';

const runtimeDir = getRuntimeDir();

function loadUpdatePlugin(pluginKey, extras = {}) {
    const plugin = STANDARD_PLUGINS[pluginKey];
    const context = {
        adaptfully: undefined,
        console,
        window: undefined,
        navigator: undefined,
        ...extras,
    };
    context.window = context;
    if (!('navigator' in extras)) {
        context.navigator = {};
    }

    for (const relative of plugin.scripts) {
        const code = fs.readFileSync(`${runtimeDir}/${relative}`, 'utf8');
        vm.runInNewContext(code, context, { filename: relative });
    }

    vm.runInNewContext(plugin.registration('update'), context);
    return context.adaptfully.get('update');
}

function createMockRegistration({ waiting = null, installing = null } = {}) {
    const listeners = {};
    const registration = {
        waiting,
        installing,
        addEventListener(event, handler) {
            if (!listeners[event]) {
                listeners[event] = [];
            }
            listeners[event].push(handler);
        },
        emit(event) {
            for (const handler of listeners[event] || []) {
                handler();
            }
        },
        async update() {
            return undefined;
        },
    };
    return registration;
}

describe('update plugins', () => {
    it('registers pwa-update and noop-update', () => {
        assert.ok(STANDARD_PLUGINS['pwa-update']);
        assert.ok(STANDARD_PLUGINS['noop-update']);
    });

    it('collects pwa-update runtime scripts and registration', () => {
        const assets = resolveRegistrationAssets({ update: 'pwa-update' });
        assert.ok(assets.runtimeScriptPaths.some((p) => /pwa-update\.js$/.test(p)));
        assert.ok(assets.runtimeScriptPaths.some((p) => /update[\\/]_helpers\.js$/.test(p)));
        assert.match(assets.inlineScript, /adaptfully\.update\.Pwa\(\)/);
    });

    it('noop-update reports unsupported and rejects apply', async () => {
        const update = loadUpdatePlugin('noop-update');
        assert.equal(update.name, 'noop');
        assert.equal(update.getStatus().state, 'unsupported');
        const status = await update.check();
        assert.equal(status.state, 'unsupported');
        await assert.rejects(
            () => update.applyAndReload(),
            /unsupported/,
        );
    });

    it('pwa-update is unsupported without serviceWorker', async () => {
        const update = loadUpdatePlugin('pwa-update');
        assert.equal(update.name, 'pwa');
        assert.equal(update.getStatus().state, 'unsupported');
        const status = await update.check();
        assert.equal(status.state, 'unsupported');
    });

    it('pwa-update reaches ready when a waiting worker exists', async () => {
        const waiting = {
            state: 'installed',
            postMessage() {},
            addEventListener() {},
        };
        const registration = createMockRegistration({ waiting });
        const messageListeners = [];
        const controllerchangeListeners = [];

        const update = loadUpdatePlugin('pwa-update', {
            location: { reload() {} },
            navigator: {
                serviceWorker: {
                    controller: {},
                    getRegistration: async () => registration,
                    addEventListener(event, handler) {
                        if (event === 'message') {
                            messageListeners.push(handler);
                        }
                        if (event === 'controllerchange') {
                            controllerchangeListeners.push(handler);
                        }
                    },
                },
            },
        });

        // Allow getRegistration().then bindRegistration to settle.
        await Promise.resolve();
        await Promise.resolve();

        assert.equal(update.getStatus().state, 'ready');
        const status = await update.check();
        assert.equal(status.state, 'ready');
        assert.equal(status.progress, 1);
    });

    it('pwa-update applyAndReload posts SKIP_WAITING', async () => {
        const messages = [];
        const waiting = {
            state: 'installed',
            postMessage(payload) {
                messages.push(payload);
            },
            addEventListener() {},
        };
        const registration = createMockRegistration({ waiting });
        let reloaded = false;

        const update = loadUpdatePlugin('pwa-update', {
            location: {
                reload() {
                    reloaded = true;
                },
            },
            navigator: {
                serviceWorker: {
                    controller: {},
                    getRegistration: async () => registration,
                    addEventListener() {},
                },
            },
        });

        await Promise.resolve();
        await Promise.resolve();
        await update.check();
        await update.applyAndReload();

        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, 'SKIP_WAITING');
        assert.equal(reloaded, false); // reload waits for controllerchange
    });

    it('pwa-update emits downloading then ready on updatefound', async () => {
        const installing = {
            state: 'installing',
            listeners: {},
            addEventListener(event, handler) {
                if (!this.listeners[event]) {
                    this.listeners[event] = [];
                }
                this.listeners[event].push(handler);
            },
            setState(state) {
                this.state = state;
                for (const handler of this.listeners.statechange || []) {
                    handler();
                }
            },
        };
        const registration = createMockRegistration();
        const statuses = [];

        const update = loadUpdatePlugin('pwa-update', {
            location: { reload() {} },
            navigator: {
                serviceWorker: {
                    controller: {},
                    getRegistration: async () => registration,
                    addEventListener() {},
                },
            },
        });

        update.on('status', (s) => statuses.push(s.state));

        await Promise.resolve();
        await Promise.resolve();
        await update.check();

        registration.installing = installing;
        registration.emit('updatefound');
        assert.equal(update.getStatus().state, 'downloading');

        installing.setState('installed');
        assert.equal(update.getStatus().state, 'ready');
        assert.ok(statuses.includes('downloading'));
        assert.ok(statuses.includes('ready'));
    });
});
