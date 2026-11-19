import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const {
    createBridge,
    launcherIdentity,
    parseEpicArgv,
} = createRequire(import.meta.url)('../lib/runtime/electron/eos-bridge.cjs');

describe('eos bridge', () => {
    it('reads Epic launcher exchange-code arguments', () => {
        const argv = [
            'Game.exe',
            '-AUTH_LOGIN=unused',
            '-AUTH_PASSWORD=exchange-code',
            '-AUTH_TYPE=exchangecode',
            '-epicuserid=account-1',
            '-epicusername=Player',
            '-EpicPortal',
        ];
        assert.equal(parseEpicArgv(argv).exchangeCode, 'exchange-code');
        assert.deepEqual(launcherIdentity(argv), {
            id: 'account-1',
            email: '',
            displayName: 'Player',
            authType: 'exchangecode',
            exchangeCode: 'exchange-code',
        });
    });

    it('uses launcher identity before dev auth', async () => {
        const bridge = createBridge({ devAuth: true }, ['-epicuserid=from-launcher', '-AUTH_TYPE=exchangecode', '-AUTH_PASSWORD=code']);
        const identity = await bridge.login();
        assert.equal(identity.id, 'from-launcher');
        assert.equal(identity.exchangeCode, 'code');
    });

    it('epic-dev falls back to EOS_DEV_ACCOUNT_ID when the launcher is absent', async () => {
        const previous = process.env.EOS_DEV_ACCOUNT_ID;
        process.env.EOS_DEV_ACCOUNT_ID = 'dev-account';
        try {
            const bridge = createBridge({ devAuth: true }, ['Game.exe']);
            const identity = await bridge.login();
            assert.equal(identity.id, 'dev-account');
            assert.equal(identity.authType, 'developer');
        } finally {
            if (previous == null) {
                delete process.env.EOS_DEV_ACCOUNT_ID;
            } else {
                process.env.EOS_DEV_ACCOUNT_ID = previous;
            }
        }
    });

    it('release builds without launcher args fail closed', async () => {
        const bridge = createBridge({ devAuth: false }, ['Game.exe']);
        await assert.rejects(() => bridge.login(), /Launcher identity was not found/);
    });
});
