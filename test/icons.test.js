import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    ICON_BACKGROUND,
    ICON_FOREGROUND,
    resolveMetaIcons,
    resolvePlaceholderIconPath,
} from '../lib/node/icons.js';

describe('resolveMetaIcons', () => {
    it('resolves packaged placeholder icon files', () => {
        const foreground = resolvePlaceholderIconPath(ICON_FOREGROUND);
        const background = resolvePlaceholderIconPath(ICON_BACKGROUND);
        assert.equal(fs.existsSync(foreground), true);
        assert.equal(fs.existsSync(background), true);
    });

    it('uses project icons when present and does not warn', () => {
        const metaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-icons-'));
        const messages = [];
        try {
            fs.copyFileSync(resolvePlaceholderIconPath(ICON_FOREGROUND), path.join(metaDir, ICON_FOREGROUND));
            fs.copyFileSync(resolvePlaceholderIconPath(ICON_BACKGROUND), path.join(metaDir, ICON_BACKGROUND));

            const resolved = resolveMetaIcons({
                metaDir,
                log: (message) => messages.push(message),
            });

            assert.equal(resolved.usedPlaceholders, false);
            assert.deepEqual(resolved.missing, []);
            assert.equal(resolved.foreground, path.join(metaDir, ICON_FOREGROUND));
            assert.equal(resolved.background, path.join(metaDir, ICON_BACKGROUND));
            assert.deepEqual(messages, []);
        } finally {
            fs.rmSync(metaDir, { recursive: true, force: true });
        }
    });

    it('warns and falls back to placeholders when icons are missing', () => {
        const metaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-icons-missing-'));
        const messages = [];
        try {
            const resolved = resolveMetaIcons({
                metaDir,
                log: (message) => messages.push(message),
            });

            assert.equal(resolved.usedPlaceholders, true);
            assert.deepEqual(resolved.missing, [ICON_FOREGROUND, ICON_BACKGROUND]);
            assert.equal(resolved.foreground, resolvePlaceholderIconPath(ICON_FOREGROUND));
            assert.equal(resolved.background, resolvePlaceholderIconPath(ICON_BACKGROUND));
            assert.equal(messages.length, 1);
            assert.match(messages[0], /WARNING missing layered icon/);
            assert.match(messages[0], /placeholder/);
        } finally {
            fs.rmSync(metaDir, { recursive: true, force: true });
        }
    });

    it('falls back only for the missing layer', () => {
        const metaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-icons-partial-'));
        try {
            fs.copyFileSync(resolvePlaceholderIconPath(ICON_FOREGROUND), path.join(metaDir, ICON_FOREGROUND));

            const resolved = resolveMetaIcons({
                metaDir,
                log: () => {},
            });

            assert.equal(resolved.usedPlaceholders, true);
            assert.deepEqual(resolved.missing, [ICON_BACKGROUND]);
            assert.equal(resolved.foreground, path.join(metaDir, ICON_FOREGROUND));
            assert.equal(resolved.background, resolvePlaceholderIconPath(ICON_BACKGROUND));
        } finally {
            fs.rmSync(metaDir, { recursive: true, force: true });
        }
    });
});
