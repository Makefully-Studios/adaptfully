import fs from 'node:fs';
import path from 'node:path';
import {
    adaptfullyInjectionForPlatform,
    injectAdaptfullyRegistrations,
} from './registrations.js';
import { applyPackagerTemplates } from './packagers.js';
import { copyRecursiveSync, emptyDirSync } from './fs-utils.js';

/** @typedef {'prebuild' | 'build' | 'deploy'} AdaptfullyStage */

const DEFAULT_HTML_INJECTIONS = ['index.html'];

/**
 * @param {{ config?: { htmlInjections?: string[] } }} pkg
 * @returns {string[]}
 */
export function resolveHtmlInjections(pkg) {
    const injections = pkg.config?.htmlInjections;
    if (injections === undefined) {
        return DEFAULT_HTML_INJECTIONS;
    }
    if (!Array.isArray(injections) || injections.length === 0) {
        throw new Error('config.htmlInjections must be a non-empty array of paths relative to the deploy folder');
    }
    for (const entry of injections) {
        if (typeof entry !== 'string' || !entry.length) {
            throw new Error('config.htmlInjections entries must be non-empty strings');
        }
    }
    return injections;
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, unknown>, outputFolder?: string } }} pkg
 * @param {string} [outputRoot='output']
 */
export function prebuildOutputDir(platformKey, pkg, outputRoot = 'output') {
    const outputFolder = pkg.config?.outputFolder || outputRoot;
    return path.resolve(outputFolder, `${platformKey}-prebuild`);
}

/**
 * @param {string} htmlPath
 * @param {string} injection
 */
export function injectAdaptfullyIntoHtmlFile(htmlPath, injection) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const updated = injectAdaptfullyRegistrations(html, injection);
    if (updated !== html) {
        fs.writeFileSync(htmlPath, updated);
    }
}

/**
 * @param {string} deployFolder
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { registrations?: Record<string, string> }> } }} pkg
 * @param {{ log?: (message: string) => void, outputRoot?: string }} [options]
 * @returns {string} Absolute path to the prebuild output directory
 */
export function prebuildPlatform(deployFolder, platformKey, pkg, options = {}) {
    const log = options.log ?? console.log;
    const source = path.resolve(deployFolder);

    if (!fs.existsSync(source)) {
        throw new Error(`Deploy folder not found: ${source}`);
    }

    const dest = prebuildOutputDir(platformKey, pkg, options.outputRoot);
    log(`adaptfully: prebuild ${platformKey} → ${dest}`);

    emptyDirSync(dest);
    copyRecursiveSync(source, dest);

    applyPackagerTemplates(dest, platformKey, pkg, { log });

    const injection = adaptfullyInjectionForPlatform(platformKey, pkg, { log });
    if (injection) {
        for (const relativePath of resolveHtmlInjections(pkg)) {
            const htmlPath = path.join(dest, relativePath);
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`htmlInjections file not found in deploy output: ${relativePath}`);
            }
            log(`adaptfully: inject ${relativePath}`);
            injectAdaptfullyIntoHtmlFile(htmlPath, injection);
        }
    }

    log(`adaptfully: prebuild complete (${platformKey})`);
    return dest;
}
