import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
    buildAdaptfullyInjection,
    injectAdaptfullyRegistrations,
    adaptfullyInjectionForPlatform,
    resolveBuildSpec,
    resolveDeploymentsForPlatform,
    resolveFamily,
    resolveFamilyFromTarget,
    resolvePlatformKey,
    resolvePlatformRegistrationsByKey,
    resolvePublishDir,
} from '../lib/node/registrations.js';

describe('registrations', () => {
    it('resolves platform from explicit builders list', () => {
        const platforms = {
            desktop: { builders: ['win', 'mac', 'linux'], registrations: { auth: 'steam-auth' } },
        };
        assert.equal(resolvePlatformKey('win', platforms), 'desktop');
    });

    it('resolves platform from default builder map', () => {
        const platforms = {
            steam: { registrations: { auth: 'steam-auth' } },
        };
        assert.equal(resolvePlatformKey('win', platforms), 'steam');
    });

    it('returns null when no platforms are configured', () => {
        assert.equal(resolvePlatformKey('steam', {}), null);
    });

    it('builds injection for standard auth plugin', () => {
        const logs = [];
        const injection = buildAdaptfullyInjection({ auth: 'google-auth' }, { log: (m) => logs.push(m) });
        assert.match(injection, /<!-- adaptfully -->/);
        assert.match(injection, /adaptfully\.register\('auth', adaptfully\.auth\.Google\)/);
        assert.match(injection, /accounts\.google\.com\/gsi\/client/);
        assert.match(injection, /adaptfully\.auth\.Google/);
        assert.deepEqual(logs, ['adaptfully: registering auth ← google-auth']);
    });

    it('builds injection for custom deploy script', () => {
        const logs = [];
        const injection = buildAdaptfullyInjection({
            auth: 'steam-auth',
            storage: '/javascript/custom-storage-solution.js',
        }, { log: (m) => logs.push(m) });
        assert.match(injection, /adaptfully\.register\('auth', adaptfully\.auth\.Steam\)/);
        assert.match(injection, /<script src="\/javascript\/custom-storage-solution\.js"><\/script>/);
        assert.doesNotMatch(injection, /adaptfully\.register\('storage'/);
        assert.deepEqual(logs, [
            'adaptfully: registering auth ← steam-auth',
            'adaptfully: registering storage ← /javascript/custom-storage-solution.js',
        ]);
    });

    it('builds injection for page-relative deploy script', () => {
        const injection = buildAdaptfullyInjection({
            storage: 'javascript/adaptfully-bridge.js',
        });
        assert.match(injection, /<script src="javascript\/adaptfully-bridge\.js"><\/script>/);
        assert.doesNotMatch(injection, /src="\/javascript\/adaptfully-bridge\.js"/);
    });

    it('loads deploy scripts after core and before auth plugins', () => {
        const injection = buildAdaptfullyInjection({
            auth: 'google-auth',
            storage: 'localStorage',
            config: 'javascript/adaptfully-config.js',
        });
        const coreIndex = injection.indexOf('class Adaptfully');
        const configIndex = injection.indexOf('<script src="javascript/adaptfully-config.js"></script>');
        const googleIndex = injection.indexOf('registerGoogleAuth');
        assert.ok(coreIndex >= 0 && configIndex > coreIndex && googleIndex > configIndex);
    });

    it('replaces adaptfully marker block in html', () => {
        const html = '<html><head><!-- adaptfully --><!-- /adaptfully --></head><body></body></html>';
        const injection = buildAdaptfullyInjection({ auth: 'dev-auth' });
        const result = injectAdaptfullyRegistrations(html, injection);
        assert.match(result, /adaptfully\.auth\.Dev/);
        assert.doesNotMatch(result, /<!-- adaptfully -->\s*<!-- \/adaptfully -->/);
    });

    it('injects before scripts marker when adaptfully marker absent', () => {
        const html = '<html><head><!-- scripts --></head></html>';
        const injection = buildAdaptfullyInjection({ auth: 'dev-auth' });
        const result = injectAdaptfullyRegistrations(html, injection);
        assert.ok(result.indexOf('adaptfully.auth.Dev') < result.indexOf('<!-- scripts -->'));
    });

    it('reads registrations from package config for platform', () => {
        const pkg = {
            config: {
                platforms: {
                    steam: {
                        registrations: {
                            auth: 'steam-auth',
                        },
                    },
                },
            },
        };
        const injection = adaptfullyInjectionForPlatform('steam', pkg);
        assert.match(injection, /adaptfully\.auth\.Steam/);
    });

    it('returns empty injection when registrations are missing', () => {
        const pkg = { config: { platforms: { steam: {} } } };
        const logs = [];
        const injection = adaptfullyInjectionForPlatform('steam', pkg, { log: (m) => logs.push(m) });
        assert.equal(injection, '');
        assert.match(logs[0], /no registrations configured for platform "steam"/);
    });

    it('resolvePlatformRegistrationsByKey returns null registrations when empty', () => {
        assert.deepEqual(resolvePlatformRegistrationsByKey('steam', { config: { platforms: { steam: {} } } }), {
            platformKey: 'steam',
            registrations: null,
        });
    });

    it('defaults deployments to zip when none are declared', () => {
        const pkg = { config: { platforms: { steam: { registrations: {} } } } };
        assert.deepEqual(resolveDeploymentsForPlatform('steam', pkg), ['zip']);
    });

    it('resolves declared deployments for a platform', () => {
        const pkg = { config: { platforms: { web: { deployments: ['web-testing', 'web-prod'] } } } };
        assert.deepEqual(resolveDeploymentsForPlatform('web', pkg), ['web-testing', 'web-prod']);
    });

    it('falls back to zip for an unknown platform', () => {
        assert.deepEqual(resolveDeploymentsForPlatform('web', { config: { platforms: {} } }), ['zip']);
    });

    it('rejects invalid deployment entries', () => {
        const pkg = { config: { platforms: { web: { deployments: [''] } } } };
        assert.throws(() => resolveDeploymentsForPlatform('web', pkg), /non-empty strings/);
    });

    it('resolves build spec for multi-target steam platform', () => {
        const pkg = {
            config: {
                platforms: {
                    steam: {
                        packager: 'electron',
                        builder: ['win', 'mac', 'linux'],
                        steamworks: true,
                        deployments: ['zip', 'steam'],
                    },
                },
            },
        };

        assert.deepEqual(resolveBuildSpec('steam', pkg), {
            family: 'electron',
            targets: ['win', 'mac', 'linux'],
            platformKey: 'steam',
            steamworks: true,
            deployments: ['zip', 'steam'],
        });
    });

    it('resolves pwa builder family with web packager', () => {
        const pkg = {
            config: {
                platforms: {
                    web: {
                        packager: 'web',
                        builder: 'pwa',
                        deployments: ['zip', 'web-prod'],
                    },
                },
            },
        };

        assert.equal(resolveFamilyFromTarget('pwa'), 'pwa');
        assert.equal(resolveFamily(['pwa'], 'web'), 'pwa');
        assert.deepEqual(resolveBuildSpec('web', pkg), {
            family: 'pwa',
            targets: ['pwa'],
            platformKey: 'web',
            steamworks: false,
            deployments: ['zip', 'web-prod'],
        });
    });

    it('resolves a deployment publish directory under assets/meta/deployments', () => {
        assert.equal(
            resolvePublishDir('web-prod'),
            path.join('assets/meta', 'deployments', 'web-prod'),
        );
    });
});
