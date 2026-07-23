import fs from 'node:fs';
import path from 'node:path';
import { getPackageRoot } from './paths.js';

export const META_DIR = 'assets/meta';
export const ICON_FOREGROUND = 'icon-foreground.png';
export const ICON_BACKGROUND = 'icon-background.png';

const ICON_FILES = [ICON_FOREGROUND, ICON_BACKGROUND];

/**
 * Absolute path to a packaged Adaptfully placeholder icon.
 * @param {string} filename
 */
export function resolvePlaceholderIconPath(filename) {
    return path.join(getPackageRoot(), 'lib', 'assets', filename);
}

/**
 * @param {string} [metaDir=META_DIR]
 */
export function resolveMetaIconPaths(metaDir = META_DIR) {
    const root = path.resolve(metaDir);
    return {
        metaDir: root,
        foreground: path.join(root, ICON_FOREGROUND),
        background: path.join(root, ICON_BACKGROUND),
    };
}

/**
 * Resolve layered icon paths for Wrapfully packaging. Warns (does not throw) when
 * project icons are missing and falls back to Adaptfully placeholders.
 *
 * @param {{ metaDir?: string, log?: (message: string) => void }} [options]
 * @returns {{
 *   metaDir: string,
 *   foreground: string,
 *   background: string,
 *   missing: string[],
 *   usedPlaceholders: boolean,
 * }}
 */
export function resolveMetaIcons(options = {}) {
    const log = options.log ?? console.log;
    const { metaDir, foreground, background } = resolveMetaIconPaths(options.metaDir);
    /** @type {string[]} */
    const missing = [];
    let resolvedForeground = foreground;
    let resolvedBackground = background;

    if (!fs.existsSync(foreground)) {
        missing.push(ICON_FOREGROUND);
        resolvedForeground = resolvePlaceholderIconPath(ICON_FOREGROUND);
    }
    if (!fs.existsSync(background)) {
        missing.push(ICON_BACKGROUND);
        resolvedBackground = resolvePlaceholderIconPath(ICON_BACKGROUND);
    }

    if (missing.length > 0) {
        log(
            `adaptfully: WARNING missing layered icon(s) in ${metaDir}: ${missing.join(', ')}. `
            + 'Using Adaptfully placeholder icons for this build.',
        );
    }

    return {
        metaDir,
        foreground: resolvedForeground,
        background: resolvedBackground,
        missing,
        usedPlaceholders: missing.length > 0,
    };
}

/**
 * Append layered icons to a zip under meta/. Uses project icons when present;
 * otherwise warns and ships Adaptfully placeholders.
 *
 * @param {import('archiver').Archiver} zip
 * @param {{ metaDir?: string, log?: (message: string) => void }} [options]
 * @returns {ReturnType<typeof resolveMetaIcons>}
 */
export function appendMetaIcons(zip, options = {}) {
    const resolved = resolveMetaIcons(options);
    zip.file(resolved.foreground, { name: `meta/${ICON_FOREGROUND}` });
    zip.file(resolved.background, { name: `meta/${ICON_BACKGROUND}` });
    return resolved;
}

/**
 * @param {string} name
 */
export function isMetaIconFilename(name) {
    return ICON_FILES.includes(name);
}
