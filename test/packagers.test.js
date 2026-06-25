import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    buildElectronMain,
    CordovaPackager,
    createPackagerForPlatform,
    ElectronPackager,
    resolvePlatformPackager,
    usesSteamAuth,
    validatePlatformPackager,
    WebPackager,
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

    it('composes electron main.js with optional steam sections', () => {
        const withoutSteam = buildElectronMain(false);
        assert.match(withoutSteam, /BrowserWindow/);
        assert.doesNotMatch(withoutSteam, /electronEnableSteamOverlay/);
        assert.doesNotMatch(withoutSteam, /preload\.js/);

        const withSteam = buildElectronMain(true);
        assert.match(withSteam, /electronEnableSteamOverlay/);
        assert.match(withSteam, /preload: path\.join\(__dirname, 'preload\.js'\)/);
        assert.match(withSteam, /sandbox: false/);
        assert.doesNotMatch(withoutSteam, /sandbox: false/);
        assert.match(withoutSteam, /sandbox: true/);
        assert.match(withSteam, /url\.startsWith\('file:'\)/);
    });

    it('collects used standard plugins across targeted platforms', () => {
        const pkg = {
            config: {
                platforms: {
                    ios: {
                        packager: 'cordova',
                        registrations: { auth: 'dev-auth', save: 'localStorage' },
                    },
                    android: {
                        packager: 'cordova',
                        registrations: { auth: 'google-auth' },
                    },
                },
            },
        };

        const packager = new CordovaPackager(pkg, { platformKey: 'ios' });
        assert.deepEqual([...packager.collectUsedPlugins()].sort(), [
            'dev-auth',
            'google-auth',
            'localStorage',
        ]);
        assert.equal(packager.usesPlugin('dev-auth'), true);
        assert.equal(packager.usesPlugin('steam-auth'), false);
    });

    it('detects steam-auth on the active platform for electron', () => {
        const pkg = {
            config: {
                steamId: 719140,
                platforms: {
                    steam: {
                        packager: 'electron',
                        registrations: { auth: 'steam-auth' },
                    },
                },
            },
        };

        const packager = createPackagerForPlatform('steam', pkg);
        assert.ok(packager instanceof ElectronPackager);
        assert.equal(packager.usesPlugin('steam-auth'), true);
        packager.validate();
    });

    it('defaults web packager platforms to web, uwp, and pwa', () => {
        const packager = new WebPackager({});
        assert.deepEqual(packager.platforms, ['web', 'uwp', 'pwa']);
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

    it('writes cordova.js, game-config.js, and HTML extras for cordova packager', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-cordova-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(
            path.join(deploy, 'index.html'),
            '<html><head><!-- adaptfully --><!-- /adaptfully --></head><body></body></html>',
        );

        const pkg = {
            name: 'sample-game',
            version: '1.0.0',
            config: {
                title: 'Sample Game',
                platforms: {
                    android: {
                        packager: 'cordova',
                        registrations: { auth: 'dev-auth' },
                    },
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'android', pkg, { log: () => {} });
        const html = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
        const gameConfig = fs.readFileSync(path.join(dest, 'game-config.js'), 'utf8');

        assert.ok(fs.existsSync(path.join(dest, 'cordova.js')));
        assert.match(html, /<script src="cordova\.js"><\/script>/);
        assert.match(html, /<script src="game-config\.js"><\/script>/);
        assert.match(html, /Content-Security-Policy/);
        assert.match(gameConfig, /"platform": "android"/);
    });

    it('writes game-config.js for uwp platform prebuild', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-uwp-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(path.join(deploy, 'index.html'), '<html><head></head><body></body></html>');

        const pkg = {
            name: 'sample-game',
            version: '1.0.0',
            config: {
                title: 'Sample Game',
                platforms: {
                    uwp: {},
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'uwp', pkg, { log: () => {} });
        const html = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
        const gameConfig = fs.readFileSync(path.join(dest, 'game-config.js'), 'utf8');

        assert.match(html, /<script src="game-config\.js"><\/script>/);
        assert.match(gameConfig, /"platform": "ms"/);
    });
});
