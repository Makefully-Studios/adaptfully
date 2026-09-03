import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWrapfullyRoute } from '../lib/node/pipeline.js';

describe('resolveWrapfullyRoute', () => {
    it('posts single-target mobile builds to the target route', () => {
        assert.equal(
            resolveWrapfullyRoute({ family: 'capacitor', targets: ['android'] }),
            'android',
        );
        assert.equal(
            resolveWrapfullyRoute({ family: 'capacitor', targets: ['ios'] }),
            'ios',
        );
    });

    it('posts multi-target builds to the family route', () => {
        assert.equal(
            resolveWrapfullyRoute({ family: 'electron', targets: ['win', 'mac', 'linux'] }),
            'electron',
        );
    });
});
