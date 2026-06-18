import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildAdaptfullyInjection,
    injectAdaptfullyRegistrations,
    adaptfullyInjectionForPlatform,
    resolvePlatformKey,
    resolvePlatformRegistrationsByKey,
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
});
