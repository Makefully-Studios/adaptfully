import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPackageRoot, getRuntimeDir, resolveRuntimeScript } from '../lib/node/paths.js';
import {
    resolveRegistrationAssets,
    STANDARD_PLUGINS,
} from '../lib/node/registrations.js';

describe('paths', () => {
    it('resolves runtime script paths under lib/runtime', () => {
        assert.match(resolveRuntimeScript('core.js'), /lib[\\/]runtime[\\/]core\.js$/);
        assert.match(getRuntimeDir(), /lib[\\/]runtime$/);
        assert.match(getPackageRoot(), /adaptfully$/);
    });
});

describe('registration assets', () => {
    it('collects google auth runtime scripts and inline registration', () => {
        const assets = resolveRegistrationAssets({ auth: 'google-auth' });
        assert.ok(assets.runtimeScriptPaths.some((p) => p.endsWith('google-auth.js')));
        assert.match(assets.inlineScript, /adaptfully\.auth\.Google/);
        assert.match(assets.extScripts[0], /accounts\.google\.com\/gsi\/client/);
    });

    it('collects deploy script srcs for custom registrations', () => {
        const assets = resolveRegistrationAssets({
            auth: 'steam-auth',
            storage: '/javascript/custom.js',
        });
        assert.deepEqual(assets.deployScriptSrcs, ['/javascript/custom.js']);
        assert.match(assets.inlineScript, /adaptfully\.auth\.Steam/);
    });

    it('exposes standard plugin keys', () => {
        assert.deepEqual(Object.keys(STANDARD_PLUGINS).sort(), ['dev-auth', 'google-auth', 'steam-auth']);
    });
});
