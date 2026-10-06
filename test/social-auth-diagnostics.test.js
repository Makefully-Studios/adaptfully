import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { getRuntimeDir } from '../lib/node/paths.js';

const runtimeDir = getRuntimeDir();

function loadSocialAuth(plugin) {
    const storage = {
        data: {},
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; },
        remove(key) { delete this.data[key]; },
    };
    const logs = [];
    const context = {
        console: {
            info(...args) { logs.push({ level: 'info', args }); },
            warn(...args) { logs.push({ level: 'warn', args }); },
            error(...args) { logs.push({ level: 'error', args }); },
            log(...args) { logs.push({ level: 'log', args }); },
        },
        setTimeout,
        clearTimeout,
        window: {
            setTimeout,
            clearTimeout,
            Capacitor: {
                getPlatform: () => 'android',
                Plugins: { SocialLogin: plugin },
            },
            __ADAPTFULLY_SOCIAL_LOGIN__: {
                providers: { google: true, apple: false },
                google: {
                    webClientId: '225754014403-lia80vuqbr312tgp6nqoin9j01up1h4q.apps.googleusercontent.com',
                },
            },
            gameConfig: {
                platform: 'android',
                packageName: 'com.gopherwoodstudios.entanglement.android',
            },
        },
        adaptfully: undefined,
    };
    context.window.adaptfully = context.adaptfully;

    for (const rel of ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/social-auth.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    context.adaptfully.register('storage', storage);
    context.adaptfully.register('auth', context.adaptfully.auth.Social);

    return { auth: context.adaptfully.get('auth'), logs };
}

describe('social-auth diagnostics', () => {
    it('logs structured details when Capgo rejects with an empty-message Error', async () => {
        const emptyError = new Error();
        emptyError.name = 'Error';
        emptyError.code = '12501';
        Object.defineProperty(emptyError, 'message', { value: '' });

        const plugin = {
            async initialize() {},
            async login() {
                throw emptyError;
            },
        };

        const { auth, logs } = loadSocialAuth(plugin);
        await new Promise((resolve) => {
            auth.whenReady(() => {
                auth.login(() => resolve());
            });
        });

        const fail = logs.find((entry) => entry.level === 'error'
            && String(entry.args[0]).includes('login failed'));
        assert.ok(fail, 'expected login failed error log');
        const details = fail.args[1];
        assert.equal(details.message, '(empty message)');
        assert.equal(details.code, '12501');
        assert.ok(details.raw && details.raw.includes('12501'));
        const ctx = fail.args[2];
        assert.equal(ctx.platform, 'android');
        assert.equal(ctx.provider, 'google');
        assert.ok(String(ctx.googleWebClientId).includes('…'));
        assert.equal(ctx.hasSocialLoginPlugin, true);
    });
});
