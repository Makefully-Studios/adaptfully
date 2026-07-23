import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    buildSteamPublishJson,
    collectSteamAuthFiles,
    defaultSteamPublishPath,
} from '../lib/node/steam-publish.js';

describe('steam-publish', () => {
    it('defaults steam.json output path', () => {
        assert.equal(
            defaultSteamPublishPath('/project'),
            path.resolve('/project', 'assets', 'meta', 'deployments', 'steam', 'steam.json'),
        );
        assert.equal(
            defaultSteamPublishPath('/project', 'steam-prod'),
            path.resolve('/project', 'assets', 'meta', 'deployments', 'steam-prod', 'steam.json'),
        );
    });

    it('builds steam.json without sentry when guard is disabled', () => {
        const json = buildSteamPublishJson({
            username: 'builder',
            password: 'secret',
            configVdfBuffer: Buffer.from('"InstallConfigStore"\n{\n}\n'),
        });

        assert.equal(json.username, 'builder');
        assert.equal(json.password, 'secret');
        assert.ok(json.configVdf);
        assert.equal(json.sentryFile, undefined);
    });

    it('builds steam.json with sentry when guard is enabled', () => {
        const json = buildSteamPublishJson({
            username: 'builder',
            password: 'secret',
            configVdfBuffer: Buffer.from('config'),
            sentryFileName: 'ssfn12345',
            sentryFileBuffer: Buffer.from('sentry'),
        });

        assert.equal(json.sentryFileName, 'ssfn12345');
        assert.equal(Buffer.from(json.sentryFile, 'base64').toString(), 'sentry');
    });

    it('collects config.vdf and ssfn from a steamcmd directory', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-steam-publish-'));

        fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'config', 'config.vdf'), '"InstallConfigStore"\n{\n}\n');
        fs.writeFileSync(path.join(tmp, 'ssfn98765'), 'sentry-data');

        const files = await collectSteamAuthFiles(tmp);

        assert.ok(files.configVdfBuffer);
        assert.equal(files.sentryFileName, 'ssfn98765');
        assert.equal(files.sentryFileBuffer?.toString(), 'sentry-data');
    });
});
