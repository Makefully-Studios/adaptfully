import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';

const runtimeDir = getRuntimeDir();

function loadSteamAuthContext(options = {}) {
    const storage = {
        data: {},
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; },
        remove(key) { delete this.data[key]; },
    };

    const context = {
        adaptfully: undefined,
        console,
        sessionStorage: {
            data: {},
            getItem(k) { return this.data[k] ?? null; },
            setItem(k, v) { this.data[k] = v; },
            removeItem(k) { delete this.data[k]; },
        },
        window: {
            __ADAPTFULLY_STEAMWORKS__: options.client,
            setTimeout,
            clearTimeout,
        },
        setTimeout,
        clearTimeout,
    };
    context.window.adaptfully = context.adaptfully;

    for (const rel of ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/steam-auth.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    context.adaptfully.register('storage', storage);
    context.adaptfully.register('config', {
        autoLoginStorageKey: 'lastLoggedIn',
    });
    vm.runInNewContext("adaptfully.register('auth', adaptfully.auth.Steam);", context);

    return context.adaptfully;
}

function autoLoginResult(adaptfully) {
    const platform = adaptfully.get('auth');
    return new Promise((resolve) => {
        platform.autoLogin(resolve);
    });
}

describe('steam auth', () => {
    it('autoLogin reads steam id and name from a steamworks client bridge', async () => {
        const adaptfully = loadSteamAuthContext({
            client: {
                localplayer: {
                    getSteamId() {
                        return { steamId64: '76561198012345678' };
                    },
                    getName() {
                        return 'TestPlayer';
                    },
                },
            },
        });

        const result = await autoLoginResult(adaptfully);
        assert.equal(result.authenticated, true);
        assert.equal(result.user?.id, '76561198012345678');
        assert.equal(result.user?.email, '');
    });

    it('supports bigint steam ids from steamworks.js', async () => {
        const adaptfully = loadSteamAuthContext({
            client: {
                localplayer: {
                    getSteamId() {
                        return { steamId64: 76561198012345678n };
                    },
                    getName() {
                        return 'DeckPlayer';
                    },
                },
            },
        });

        const result = await autoLoginResult(adaptfully);
        assert.equal(result.user?.id, '76561198012345678');
    });

    it('reports unauthenticated when no steamworks bridge is present', async () => {
        const adaptfully = loadSteamAuthContext();
        const result = await autoLoginResult(adaptfully);
        assert.equal(result.authenticated, false);
    });
});
