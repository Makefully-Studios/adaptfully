import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prebuildPlatform, resolveHtmlInjections } from '../lib/node/prebuild.js';

describe('prebuild', () => {
    it('defaults htmlInjections to index.html', () => {
        assert.deepEqual(resolveHtmlInjections({ config: {} }), ['index.html']);
        assert.deepEqual(resolveHtmlInjections({}), ['index.html']);
    });

    it('reads htmlInjections from package config', () => {
        assert.deepEqual(
            resolveHtmlInjections({ config: { htmlInjections: ['index.html', 'en-US-index.html'] } }),
            ['index.html', 'en-US-index.html'],
        );
    });

    it('writes platform output with adaptfully injection applied to html files', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-prebuild-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(path.join(deploy, 'index.html'), '<html><body><!-- adaptfully --><!-- /adaptfully --></body></html>');

        const pkg = {
            config: {
                platforms: {
                    web: {
                        registrations: {
                            auth: 'dev-auth',
                        },
                    },
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'web', pkg, { log: () => {} });
        assert.equal(dest, path.join(outputRoot, 'web-prebuild'));

        const html = fs.readFileSync(path.join(dest, 'index.html'), 'utf8');
        assert.match(html, /adaptfully\.auth\.Dev/);
        assert.doesNotMatch(html, /<!-- adaptfully -->\s*<!-- \/adaptfully -->/);
    });

    it('injects only files listed in htmlInjections', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-prebuild-'));
        const deploy = path.join(tmp, 'deploy');
        const outputRoot = path.join(tmp, 'output');
        fs.mkdirSync(deploy, { recursive: true });
        fs.writeFileSync(path.join(deploy, 'index.html'), '<html><body><!-- adaptfully --><!-- /adaptfully --></body></html>');
        fs.writeFileSync(path.join(deploy, 'other.html'), '<html><body><!-- adaptfully --><!-- /adaptfully --></body></html>');

        const pkg = {
            config: {
                htmlInjections: ['index.html'],
                platforms: {
                    web: { registrations: { auth: 'dev-auth' } },
                },
                outputFolder: outputRoot,
            },
        };

        const dest = prebuildPlatform(deploy, 'web', pkg, { log: () => {} });

        assert.match(fs.readFileSync(path.join(dest, 'index.html'), 'utf8'), /adaptfully\.auth\.Dev/);
        assert.doesNotMatch(fs.readFileSync(path.join(dest, 'other.html'), 'utf8'), /adaptfully\.auth\.Dev/);
    });
});
