import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCarGames, resolvePlatformCarGames } from '../lib/node/car-games.js';
import { PLATFORM_CONTROL_KEYS } from '../lib/node/platform-config.js';
import { CapacitorPackager } from '../lib/node/packagers/capacitor.js';
import { WebPackager } from '../lib/node/packagers/web.js';

describe('resolveCarGames', () => {
    it('enables both when true', () => {
        assert.deepEqual(resolveCarGames(true), {
            enabled: true,
            androidAuto: true,
            automotive: true,
        });
    });

    it('normalizes object flags (missing = false)', () => {
        assert.deepEqual(resolveCarGames({ androidAuto: true }), {
            enabled: true,
            androidAuto: true,
            automotive: false,
        });
        assert.deepEqual(resolveCarGames({ automotive: true }), {
            enabled: true,
            androidAuto: false,
            automotive: true,
        });
        assert.deepEqual(resolveCarGames({}), {
            enabled: false,
            androidAuto: false,
            automotive: false,
        });
    });

    it('treats falsy as disabled', () => {
        assert.equal(resolveCarGames(false).enabled, false);
        assert.equal(resolveCarGames(null).enabled, false);
        assert.equal(resolveCarGames(undefined).enabled, false);
    });
});

describe('carGames platform control', () => {
    it('lists carGames as a control key', () => {
        assert.equal(PLATFORM_CONTROL_KEYS.has('carGames'), true);
    });

    it('resolves platform carGames over root', () => {
        const pkg = {
            config: {
                carGames: true,
                platforms: {
                    android: { carGames: { androidAuto: true } },
                },
            },
        };
        assert.deepEqual(
            resolveCarGames(resolvePlatformCarGames('android', pkg)),
            { enabled: true, androidAuto: true, automotive: false },
        );
    });
});

describe('car-host packager validation', () => {
    it('requires carGames when car-host is registered on capacitor', () => {
        const packager = new CapacitorPackager({
            name: 'demo',
            version: '1.0.0',
            config: {
                platforms: {
                    android: {
                        packager: 'capacitor',
                        registrations: { host: 'car-host' },
                    },
                },
            },
        }, { platformKey: 'android', platforms: ['android'] });

        assert.throws(
            () => packager.validate(),
            /carGames/,
        );
    });

    it('accepts car-host with carGames true', () => {
        const packager = new CapacitorPackager({
            name: 'demo',
            version: '1.0.0',
            config: {
                platforms: {
                    android: {
                        packager: 'capacitor',
                        carGames: true,
                        registrations: { host: 'car-host' },
                    },
                },
            },
        }, { platformKey: 'android', platforms: ['android'] });

        assert.doesNotThrow(() => packager.validate());
    });

    it('rejects car-host on non-capacitor packager', () => {
        const packager = new WebPackager({
            name: 'demo',
            version: '1.0.0',
            config: {
                platforms: {
                    web: {
                        packager: 'web',
                        carGames: true,
                        registrations: { host: 'car-host' },
                    },
                },
            },
        }, { platformKey: 'web', platforms: ['web'] });

        assert.throws(
            () => packager.validate(),
            /car-host.*capacitor/i,
        );
    });
});
