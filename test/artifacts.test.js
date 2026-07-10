import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildOutputDir, resolveBuildArtifactDir } from '../lib/node/artifacts.js';

describe('artifacts', () => {
    /** @type {string[]} */
    const tmpDirs = [];

    afterEach(() => {
        for (const dir of tmpDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function makeOutput(pkg, manifest) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-artifact-'));
        tmpDirs.push(root);
        const outputDir = path.join(root, 'output');
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(
            path.join(outputDir, 'wrapfully-build.json'),
            JSON.stringify(manifest),
        );
        return {
            pkg: { ...pkg, config: { outputFolder: outputDir } },
            outputDir,
        };
    }

    it('resolves the default build output directory', () => {
        const pkg = { name: 'game', version: '1.0.0', config: { outputFolder: 'dist' } };
        assert.equal(buildOutputDir(pkg), path.resolve('dist'));
    });

    it('finds a prior build artifact in output/', () => {
        const { pkg, outputDir } = makeOutput(
            { name: 'game', version: '1.0.0' },
            { gameId: 'game-1.0.0', platformKey: 'web' },
        );

        assert.equal(resolveBuildArtifactDir(pkg, { platformKey: 'web' }), outputDir);
    });

    it('rejects deploy when no build artifact exists', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-artifact-'));
        tmpDirs.push(root);
        const outputDir = path.join(root, 'empty-output');
        fs.mkdirSync(outputDir, { recursive: true });
        const pkg = { name: 'game', version: '1.0.0', config: { outputFolder: outputDir } };

        assert.throws(
            () => resolveBuildArtifactDir(pkg),
            /No prior build artifact found/,
        );
    });

    it('rejects a platform mismatch', () => {
        const { pkg } = makeOutput(
            { name: 'game', version: '1.0.0' },
            { gameId: 'game-1.0.0', platformKey: 'web' },
        );

        assert.throws(
            () => resolveBuildArtifactDir(pkg, { platformKey: 'steam' }),
            /platform "web"/,
        );
    });
});
