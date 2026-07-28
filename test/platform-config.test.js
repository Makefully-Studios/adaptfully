import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    getConfigValue,
    resolveConfigForBuild,
    resolvePlatformConfig,
    PLATFORM_CONTROL_KEYS,
} from '../lib/node/platform-config.js';

describe('platform-config', () => {
    const pkg = {
        name: 'demo',
        config: {
            title: 'Default Title',
            packageName: 'com.example.demo',
            themeColor: '#111111',
            publisherDisplayName: 'Example',
            platforms: {
                android: {
                    packageName: 'com.example.demo.android',
                    themeColor: '#222222',
                    packager: 'capacitor',
                    registrations: { auth: 'social-auth' },
                },
                'android-dev': {
                    packageName: 'com.example.demo.dev',
                },
                steam: {
                    packager: 'electron',
                    steamId: 123,
                },
            },
        },
    };

    it('returns top-level defaults when platformKey is missing', () => {
        const config = resolvePlatformConfig(pkg, null);
        assert.equal(config.packageName, 'com.example.demo');
        assert.equal(config.title, 'Default Title');
        assert.equal(config.platforms, undefined);
    });

    it('overrides defaults with platform fields', () => {
        const config = resolvePlatformConfig(pkg, 'android');
        assert.equal(config.packageName, 'com.example.demo.android');
        assert.equal(config.themeColor, '#222222');
        assert.equal(config.title, 'Default Title');
        assert.equal(config.publisherDisplayName, 'Example');
    });

    it('does not treat control keys as config overrides', () => {
        const config = resolvePlatformConfig(pkg, 'android');
        assert.equal(config.packager, undefined);
        assert.equal(config.registrations, undefined);
        assert.ok(PLATFORM_CONTROL_KEYS.has('packager'));
    });

    it('supports getConfigValue helpers', () => {
        assert.equal(getConfigValue(pkg, 'android', 'packageName'), 'com.example.demo.android');
        assert.equal(getConfigValue(pkg, 'steam', 'packageName'), 'com.example.demo');
        assert.equal(getConfigValue(pkg, 'missing', 'title', 'fallback'), 'Default Title');
    });

    it('prefers deployment-keyed platform for resolveConfigForBuild', () => {
        const config = resolveConfigForBuild(pkg, {
            platformKey: 'mobile',
            deploymentKey: 'android',
        });
        assert.equal(config.packageName, 'com.example.demo.android');
    });

    it('resolves android-dev packageName override', () => {
        assert.equal(
            getConfigValue(pkg, 'android-dev', 'packageName'),
            'com.example.demo.dev',
        );
    });
});
