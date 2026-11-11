/**
 * Upload ledger for store listing image sets (Play, ASC, future platforms).
 * Lives at assets/meta/store-assets/upload-ledger.json (zip: meta/store-assets/…).
 *
 * Set key: `{platform}/{locale}/{slot}` e.g. google/en-US/phoneScreenshots
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const LEDGER_FILENAME = 'upload-ledger.json';
export const LEDGER_VERSION = 1;

/**
 * @param {string} storeAssetsRoot Absolute path to store-assets (…/meta/store-assets)
 * @returns {string}
 */
export function ledgerPath(storeAssetsRoot) {
    return path.join(storeAssetsRoot, LEDGER_FILENAME);
}

/**
 * @param {string} platform
 * @param {string} locale
 * @param {string} slot
 * @returns {string}
 */
export function makeSetKey(platform, locale, slot) {
    return `${platform}/${locale}/${slot}`;
}

/**
 * @param {string | Buffer | Uint8Array} data
 * @returns {string}
 */
export function sha256Buffer(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    const handle = await fsp.open(filePath, 'r');
    try {
        const stream = handle.createReadStream();
        for await (const chunk of stream) {
            hash.update(chunk);
        }
    } finally {
        await handle.close();
    }
    return hash.digest('hex');
}

/**
 * Ordered SHA-256 for each path (display / upload order).
 * @param {string[]} filePaths Absolute paths
 * @returns {Promise<string[]>}
 */
export async function sha256Sequence(filePaths) {
    const out = [];
    for (const filePath of filePaths) {
        out.push(await sha256File(filePath));
    }
    return out;
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
export function sequencesEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * @returns {{ version: number, sets: Record<string, object> }}
 */
export function emptyLedger() {
    return { version: LEDGER_VERSION, sets: {} };
}

/**
 * @param {string} storeAssetsRoot
 * @returns {Promise<{ version: number, sets: Record<string, object> }>}
 */
export async function readLedger(storeAssetsRoot) {
    const file = ledgerPath(storeAssetsRoot);
    try {
        const raw = await fsp.readFile(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return emptyLedger();
        }
        const sets = parsed.sets && typeof parsed.sets === 'object' ? parsed.sets : {};
        return { version: Number(parsed.version) || LEDGER_VERSION, sets };
    } catch (err) {
        if (err && (err.code === 'ENOENT' || err instanceof SyntaxError)) {
            return emptyLedger();
        }
        throw err;
    }
}

/**
 * @param {string} storeAssetsRoot
 * @param {{ version?: number, sets: Record<string, object> }} ledger
 * @returns {Promise<void>}
 */
export async function writeLedger(storeAssetsRoot, ledger) {
    await fsp.mkdir(storeAssetsRoot, { recursive: true });
    const payload = {
        version: ledger.version || LEDGER_VERSION,
        sets: ledger.sets || {},
    };
    await fsp.writeFile(ledgerPath(storeAssetsRoot), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/**
 * @param {{ version: number, sets: Record<string, object> }} ledger
 * @param {string} setKey
 * @param {string[]} sequence
 * @param {boolean} [force]
 * @returns {boolean} true when local sequence matches last successful upload
 */
export function ledgerMatchesSet(ledger, setKey, sequence, force = false) {
    if (force) {
        return false;
    }
    const entry = ledger?.sets?.[setKey];
    if (!entry || !Array.isArray(entry.sha256Sequence)) {
        return false;
    }
    return sequencesEqual(entry.sha256Sequence, sequence);
}

/**
 * Record a successful upload for one set. Does not touch other sets.
 * @param {{ version: number, sets: Record<string, object> }} ledger
 * @param {string} setKey
 * @param {{ sha256Sequence: string[], assetIds?: string[], uploadedAt?: string }} update
 */
export function recordSetSuccess(ledger, setKey, update) {
    if (!ledger.sets) {
        ledger.sets = {};
    }
    ledger.sets[setKey] = {
        sha256Sequence: [...update.sha256Sequence],
        uploadedAt: update.uploadedAt || new Date().toISOString(),
        ...(Array.isArray(update.assetIds) ? { assetIds: [...update.assetIds] } : {}),
    };
}

/**
 * Sync-friendly: list image files in a directory in alphanumeric order.
 * @param {string} dir
 * @returns {Promise<string[]>} Absolute paths
 */
export async function listOrderedImageFiles(dir) {
    let names;
    try {
        names = await fsp.readdir(dir);
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return [];
        }
        throw err;
    }
    const images = names
        .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return images.map((name) => path.join(dir, name));
}

/**
 * @param {string} storeAssetsRoot
 * @returns {boolean}
 */
export function ledgerFileExists(storeAssetsRoot) {
    return fs.existsSync(ledgerPath(storeAssetsRoot));
}
