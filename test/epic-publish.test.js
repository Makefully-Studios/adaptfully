import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    buildEpicPublishJson,
    defaultEpicPublishPath,
    runEpicPublish,
} from '../lib/node/epic-publish.js';

describe('epic-publish', () => {
    it('defaults epic.json output path', () => {
        assert.equal(
            defaultEpicPublishPath('/project'),
            path.resolve('/project', 'assets', 'meta', 'deployments', 'epic', 'epic.json'),
        );
        assert.equal(
            defaultEpicPublishPath('/project', 'epic-prod'),
            path.resolve('/project', 'assets', 'meta', 'deployments', 'epic-prod', 'epic.json'),
        );
    });

    it('requires both BPT client id and secret', () => {
        assert.throws(() => buildEpicPublishJson({ clientId: 'id' }), /clientId and clientSecret/);
        assert.deepEqual(buildEpicPublishJson({ clientId: 'id', clientSecret: 'secret' }), {
            clientId: 'id',
            clientSecret: 'secret',
        });
    });

    it('writes epic.json and does not invent missing manifest ids', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-epic-publish-'));
        const result = await runEpicPublish({
            projectRoot: root,
            clientId: 'bpt-client',
            clientSecret: 'bpt-secret',
            organizationId: 'org',
            log: () => {},
        });

        const epicJson = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
        assert.deepEqual(epicJson, { clientId: 'bpt-client', clientSecret: 'bpt-secret' });

        const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(result.outputPath), 'manifest.json'), 'utf8'));
        assert.equal(manifest.type, 'epic');
        assert.equal(manifest.organizationId, 'org');
        assert.equal(manifest.productId, undefined);
        assert.equal(manifest.artifactId, undefined);
        assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /epic\.json/);
    });
});
