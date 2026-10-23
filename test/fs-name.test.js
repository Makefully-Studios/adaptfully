import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it} from 'node:test';
import {buildGameId, sanitizeFsSegment} from '../lib/node/fs-name.js';
import {resolveExtractRoot} from '../lib/node/artifacts.js';
import {prebuildOutputDir} from '../lib/node/prebuild.js';

describe('sanitizeFsSegment', () => {
    it('flattens scoped npm names', () => {
        assert.equal(sanitizeFsSegment('@makefully/fancifully'), 'makefully-fancifully');
        assert.equal(sanitizeFsSegment('@makefully\\fancifully'), 'makefully-fancifully');
        assert.equal(buildGameId('@makefully/fancifully', '0.1.0'), 'makefully-fancifully-0.1.0');
    });

    it('falls back when empty', () => {
        assert.equal(sanitizeFsSegment(''), 'app');
        assert.equal(sanitizeFsSegment('@@@'), 'app');
    });
});

describe('artifact folder names', () => {
    it('keeps extract roots flat for odd platform keys', () => {
        const root = resolveExtractRoot('output', '@scope/web');
        assert.equal(path.basename(root), 'scope-web');
        assert.ok(!root.includes('@'));
    });

    it('keeps prebuild dirs flat for odd platform keys', () => {
        const dir = prebuildOutputDir('@scope/web', {config: {}}, 'output');
        assert.equal(path.basename(dir), 'scope-web-prebuild');
    });
});
