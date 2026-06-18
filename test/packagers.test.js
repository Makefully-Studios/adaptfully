import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    applyTemplateMarker,
    resolvePlatformPackager,
    usesSteamAuth,
    validatePlatformPackager,
} from '../lib/node/packagers.js';
import { prebuildPlatform } from '../lib/node/prebuild.js';

describe('packagers', () => {
    it('defaults packager to web', () => {
        assert.equal(resolvePlatformPackager('web', { config: { platforms: { web: {} } } }), 'web');
        assert.equal(resolvePlatformPackager('steam', { config: { platforms: { steam: {} } } }), 'web');
    });

    it('reads packager from platform config', () => {
        const pkg = {
            config: {
                platforms: {
                    steam: { packager: 'electron' },
                },
            },
        };
        assert.equal(resolvePlatformPackager('steam', pkg), 'electron');
    });

    it('detects steam-auth in registrations', () => {
        assert.equal(usesSteamAuth({ auth: 'steam-auth' }), true);
        assert.equal(usesSteamAuth({ auth: 'google-auth' }), false);
    });

    it('throws when steam-auth is used without electron packager', () => {
        assert.throws(
            () => validatePlatformPackager('steam', {
                config: {
                    steamId: 719140,
                    platforms: {
                        steam: {
                            registrations: { auth: 'steam-auth' },
                        },
                    },
                },
            }),
            /packager is "web"/,
        );
    });

    it('throws when steam-auth is used without steamId', () => {
        assert.throws(
            () => validatePlatformPackager('steam', {
                config: {
                    platforms: {
                        steam: {
                            packager: 'electron',
                            registrations: { auth: 'steam-auth' },
                        },
                    },
                },
            }),
            /steamId is not set/,
        );
    });

    it('replaces template markers', () => {
        const input = 'before\n/* adaptfully-steam-init */\n/* /adaptfully-steam-init */\nafter';
        const output = applyTemplateMarker(input, 'steam-init', 'injected');
        assert.equal(output, 'before\ninjected\nafter');
    });
});

describe('prebuild packager templates', () => {
    it('writes main.js for electron platforms', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-electron-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(path.join(deploy, 'index.html'), '<html><head><!-- adaptfully --><!-- /adaptfully --></head><body></body></html>');

        const pkg = {
            config: {
                platforms: {
                    desktop: {
                        packager: 'electron',
                        registrations: { auth: 'dev-auth' },
                    },
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'desktop', pkg, { log: () => {} });
        const mainPath = path.join(dest, 'main.js');
        assert.ok(fs.existsSync(mainPath));
        const main = fs.readFileSync(mainPath, 'utf8');
        assert.match(main, /BrowserWindow/);
        assert.doesNotMatch(main, /adaptfully-steam-init/);
        assert.doesNotMatch(main, /preload\.js/);
    });

    it('writes main.js and preload.js with steamworks for steam-auth', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-steam-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(path.join(deploy, 'index.html'), '<html><head><!-- adaptfully --><!-- /adaptfully --></head><body></body></html>');

        const pkg = {
            config: {
                steamId: 719140,
                platforms: {
                    steam: {
                        packager: 'electron',
                        registrations: { auth: 'steam-auth' },
                    },
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'steam', pkg, { log: () => {} });
        const main = fs.readFileSync(path.join(dest, 'main.js'), 'utf8');
        const preload = fs.readFileSync(path.join(dest, 'preload.js'), 'utf8');

        assert.match(main, /electronEnableSteamOverlay/);
        assert.match(main, /preload: path\.join\(__dirname, 'preload\.js'\)/);
        assert.match(preload, /steamworks\.js.*init\(719140\)/s);
        assert.match(preload, /__ADAPTFULLY_STEAMWORKS__/);
    });

    it('does not write main.js for web packager', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-web-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(path.join(deploy, 'index.html'), '<html><head><!-- adaptfully --><!-- /adaptfully --></head><body></body></html>');

        const pkg = {
            config: {
                platforms: {
                    web: {
                        registrations: { auth: 'dev-auth' },
                    },
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'web', pkg, { log: () => {} });
        assert.ok(!fs.existsSync(path.join(dest, 'main.js')));
    });
});
