import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    emptyLedger,
    ledgerMatchesSet,
    makeSetKey,
    readLedger,
    recordSetSuccess,
    sequencesEqual,
    sha256Sequence,
    writeLedger,
} from '../lib/node/store-assets-ledger.js';

describe('store-assets-ledger', () => {
    it('makeSetKey uses platform/locale/slot', () => {
        assert.equal(makeSetKey('google', 'en-US', 'phoneScreenshots'), 'google/en-US/phoneScreenshots');
        assert.equal(makeSetKey('apple', 'en-US', 'creative/product-page-header'), 'apple/en-US/creative/product-page-header');
    });

    it('sequencesEqual requires same order', () => {
        assert.equal(sequencesEqual(['a', 'b'], ['a', 'b']), true);
        assert.equal(sequencesEqual(['a', 'b'], ['b', 'a']), false);
        assert.equal(sequencesEqual(['a'], ['a', 'b']), false);
    });

    it('ledgerMatchesSet skips when sequence matches; force bypasses', async () => {
        const root = mkdtempSync(path.join(tmpdir(), 'af-ledger-'));
        try {
            const dir = path.join(root, 'imgs');
            mkdirSync(dir);
            const a = path.join(dir, '01.png');
            const b = path.join(dir, '02.png');
            writeFileSync(a, 'alpha');
            writeFileSync(b, 'beta');
            const sequence = await sha256Sequence([a, b]);

            const ledger = emptyLedger();
            recordSetSuccess(ledger, 'google/en-US/phoneScreenshots', { sha256Sequence: sequence });
            await writeLedger(root, ledger);

            const loaded = await readLedger(root);
            assert.equal(ledgerMatchesSet(loaded, 'google/en-US/phoneScreenshots', sequence), true);
            assert.equal(ledgerMatchesSet(loaded, 'google/en-US/phoneScreenshots', sequence, true), false);

            const reversed = await sha256Sequence([b, a]);
            assert.equal(ledgerMatchesSet(loaded, 'google/en-US/phoneScreenshots', reversed), false);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('recordSetSuccess does not clear other sets', () => {
        const ledger = emptyLedger();
        recordSetSuccess(ledger, 'google/en-US/icon', { sha256Sequence: ['aa'] });
        recordSetSuccess(ledger, 'google/en-US/featureGraphic', { sha256Sequence: ['bb'] });
        assert.deepEqual(ledger.sets['google/en-US/icon'].sha256Sequence, ['aa']);
        assert.deepEqual(ledger.sets['google/en-US/featureGraphic'].sha256Sequence, ['bb']);
    });
});
