import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    ensureDeploymentManifest,
    ensurePublishCredentialsGitignore,
    defaultDeploymentCredentialPath,
    PUBLISH_CREDENTIAL_GITIGNORE_PATTERNS,
} from '../lib/node/publish-credentials.js';
import {
    defaultGooglePublishPath,
    runGooglePublish,
    validateGoogleServiceAccount,
} from '../lib/node/google-publish.js';
import {
    buildApplePublishJson,
    defaultApplePublishPath,
    runApplePublish,
    validateApplePublishJson,
} from '../lib/node/apple-publish.js';

describe('publish-credentials', () => {
    it('builds default credential paths', () => {
        assert.equal(
            defaultDeploymentCredentialPath('/p', 'android', 'google.json'),
            path.resolve('/p', 'assets', 'meta', 'deployments', 'android', 'google.json'),
        );
    });

    it('creates and updates deployment manifest type', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-manifest-'));
        const logs = [];

        const created = await ensureDeploymentManifest(tmp, 'google', (m) => logs.push(m));
        assert.equal(created.created, true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8')).type, 'google');

        const updated = await ensureDeploymentManifest(tmp, 'apple', (m) => logs.push(m));
        assert.equal(updated.updated, true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8')).type, 'apple');
    });

    it('appends missing credential patterns to .gitignore', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-gitignore-'));
        fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\n');

        const first = await ensurePublishCredentialsGitignore(tmp, { log: () => {} });
        assert.equal(first.updated, true);
        assert.ok(first.added.includes('assets/meta/deployments/**/google.json'));

        const content = fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8');
        assert.match(content, /Adaptfully publish credentials/);
        for (const pattern of PUBLISH_CREDENTIAL_GITIGNORE_PATTERNS) {
            assert.match(content, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }

        const second = await ensurePublishCredentialsGitignore(tmp, { log: () => {} });
        assert.equal(second.updated, false);
        assert.deepEqual(second.added, []);
    });

    it('adds a custom output path under the project root', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-gitignore-extra-'));
        const custom = path.join(tmp, 'secrets', 'play.json');

        const result = await ensurePublishCredentialsGitignore(tmp, {
            extraPaths: [custom],
            log: () => {},
        });

        assert.ok(result.added.includes('secrets/play.json'));
        assert.match(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8'), /secrets\/play\.json/);
    });
});

describe('google-publish', () => {
    it('defaults google.json output path', () => {
        assert.equal(
            defaultGooglePublishPath('/project'),
            path.resolve('/project', 'assets', 'meta', 'deployments', 'android', 'google.json'),
        );
    });

    it('validates service account JSON', () => {
        assert.throws(() => validateGoogleServiceAccount({ type: 'user' }), /service_account/);
        assert.throws(() => validateGoogleServiceAccount({ type: 'service_account' }), /missing required/);

        const ok = validateGoogleServiceAccount({
            type: 'service_account',
            project_id: 'proj',
            private_key: 'key',
            client_email: 'bot@proj.iam.gserviceaccount.com',
        });
        assert.equal(ok.client_email, 'bot@proj.iam.gserviceaccount.com');
    });

    it('imports a service account into the deployment folder', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-google-publish-'));
        const from = path.join(tmp, 'sa.json');
        const projectRoot = path.join(tmp, 'game');

        await fsp.writeFile(from, JSON.stringify({
            type: 'service_account',
            project_id: 'proj',
            private_key: 'key',
            client_email: 'bot@proj.iam.gserviceaccount.com',
        }));

        const result = await runGooglePublish({
            from,
            projectRoot,
            log: () => {},
        });

        assert.equal(
            result.outputPath,
            path.resolve(projectRoot, 'assets', 'meta', 'deployments', 'android', 'google.json'),
        );
        assert.equal(result.googleJson.client_email, 'bot@proj.iam.gserviceaccount.com');
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(path.dirname(result.outputPath), 'manifest.json'), 'utf8')).type,
            'google',
        );
    });
});

describe('apple-publish', () => {
    it('defaults apple.json output path', () => {
        assert.equal(
            defaultApplePublishPath('/project'),
            path.resolve('/project', 'assets', 'meta', 'deployments', 'ios', 'apple.json'),
        );
    });

    it('builds and validates apple.json', () => {
        const json = buildApplePublishJson({
            category: 'Games',
            identity: 'TEAMID',
            username: 'dev@example.com',
            password: 'app-specific',
        });
        assert.deepEqual(json, validateApplePublishJson(json));
        assert.throws(() => validateApplePublishJson({ username: 'x' }), /missing required/);
    });

    it('writes apple credentials from options without prompting', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-apple-publish-'));
        const projectRoot = path.join(tmp, 'game');

        const result = await runApplePublish({
            projectRoot,
            category: 'Games',
            identity: 'TEAMID',
            username: 'dev@example.com',
            password: 'app-specific',
            log: () => {},
        });

        assert.equal(
            result.outputPath,
            path.resolve(projectRoot, 'assets', 'meta', 'deployments', 'ios', 'apple.json'),
        );
        assert.equal(result.appleJson.identity, 'TEAMID');
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(path.dirname(result.outputPath), 'manifest.json'), 'utf8')).type,
            'apple',
        );
    });
});
