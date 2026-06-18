import fs from 'node:fs';
import path from 'node:path';
import {
    adaptfullyInjectionForPlatform,
    injectAdaptfullyRegistrations,
} from './registrations.js';
import { copyRecursiveSync, emptyDirSync, listHtmlFilesRecursive } from './fs-utils.js';

/** @typedef {'prebuild' | 'build' | 'deploy'} AdaptfullyStage */

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

    const injection = adaptfullyInjectionForPlatform(platformKey, pkg, { log });
    if (injection) {
        for (const htmlPath of listHtmlFilesRecursive(dest)) {
            injectAdaptfullyIntoHtmlFile(htmlPath, injection);
        }
    }

    log(`adaptfully: prebuild complete (${platformKey})`);
    return dest;
}
