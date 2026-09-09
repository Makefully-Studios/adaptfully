import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Readable, PassThrough} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import archiver from 'archiver';
import unzipper from 'unzip-stream';
import {
    WRAPFULLY_DEFAULT_KID,
    WRAPFULLY_DEFAULT_PUBLIC_KEY,
} from './wrapfullyDefaultPublicKey.js';

const
    ENVELOPE_DATA = 'wrapfully.enc',
    ENVELOPE_KEY = 'wrapfully.key.enc',
    ENVELOPE_META = 'wrapfully-crypto.json',
    RESULT_DATA = 'result.enc',
    RESULT_KEY = 'result.key.enc',
    ALG = 'RSA-OAEP-SHA256+AES-256-GCM';

function aesEncrypt (plaintext) {
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {key, ciphertext: Buffer.concat([iv, tag, enc])};
}

function aesDecrypt (key, blob) {
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const data = blob.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
}

function wrapKey (aesKey, publicKeyPem) {
    return crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        aesKey,
    );
}

function unwrapKey (wrapped, privateKeyPem) {
    return crypto.privateDecrypt(
        {
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        wrapped,
    );
}

export function generateResultKeyPair () {
    const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {type: 'spki', format: 'pem'},
        privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
    });

    return {publicKey, privateKey};
}

export function resolveEncryptPublicKey (wrapfullyConfig = {}, cliPublicKey) {
    if (cliPublicKey) {
        if (cliPublicKey.includes('BEGIN PUBLIC KEY')) {
            return {pem: cliPublicKey.trim(), kid: wrapfullyConfig.encryptKid || 'override'};
        }
        return {
            pem: fs.readFileSync(cliPublicKey, 'utf8').trim(),
            kid: wrapfullyConfig.encryptKid || 'override',
        };
    }
    if (wrapfullyConfig.encryptPublicKey) {
        const value = wrapfullyConfig.encryptPublicKey;

        if (String(value).includes('BEGIN PUBLIC KEY')) {
            return {pem: String(value).trim(), kid: wrapfullyConfig.encryptKid || 'override'};
        }
        return {
            pem: fs.readFileSync(value, 'utf8').trim(),
            kid: wrapfullyConfig.encryptKid || 'override',
        };
    }

    return {pem: WRAPFULLY_DEFAULT_PUBLIC_KEY.trim(), kid: WRAPFULLY_DEFAULT_KID};
}

async function bufferFromStream (stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}

async function zipToBuffer (appendFn) {
    const archive = archiver('zip', {zlib: {level: 0}});
    const pass = new PassThrough();
    const chunks = [];

    archive.pipe(pass);
    pass.on('data', (c) => chunks.push(c));

    const done = new Promise((resolve, reject) => {
        pass.on('end', resolve);
        pass.on('error', reject);
        archive.on('error', reject);
    });

    await appendFn(archive);
    await archive.finalize();
    await done;

    return Buffer.concat(chunks);
}

/**
 * Wrap an inner zip stream/buffer in a Yap-safe envelope for Wrapfully workers.
 */
export async function createEnvelopeFromInnerZip (innerZip, {publicKeyPem, kid, resultKeyPair}) {
    const innerBuf = Buffer.isBuffer(innerZip) ? innerZip : await bufferFromStream(innerZip);
    const {key, ciphertext} = aesEncrypt(innerBuf);
    const wrapped = wrapKey(key, publicKeyPem);
    const meta = {
        kid,
        alg: ALG,
        resultPub: resultKeyPair.publicKey,
    };

    const zip = await zipToBuffer(async (archive) => {
        archive.append(ciphertext, {name: ENVELOPE_DATA});
        archive.append(wrapped, {name: ENVELOPE_KEY});
        archive.append(JSON.stringify(meta, null, 2), {name: ENVELOPE_META});
        archive.append(resultKeyPair.publicKey, {name: 'resultPub.pem'});
    });

    return {zip, resultPriv: resultKeyPair.privateKey, kid};
}

/**
 * Decrypt a completed Yap result envelope into a plaintext zip Buffer.
 */
export async function decryptResultEnvelope (resultZipBuf, resultPrivPem) {
    if (!resultPrivPem) {
        throw new Error('Missing resultPriv for encrypted Wrapfully chore download.');
    }

    const tmp = path.join(os.tmpdir(), `adaptfully-result-${Date.now().toString(16)}`);

    fs.mkdirSync(tmp, {recursive: true});
    try {
        await pipeline(Readable.from(resultZipBuf), unzipper.Extract({path: tmp}));
        if (!fs.existsSync(path.join(tmp, RESULT_DATA))) {
            // Not an envelope — return as-is
            return resultZipBuf;
        }
        const ciphertext = fs.readFileSync(path.join(tmp, RESULT_DATA));
        const wrapped = fs.readFileSync(path.join(tmp, RESULT_KEY));
        const aesKey = unwrapKey(wrapped, resultPrivPem);

        return aesDecrypt(aesKey, ciphertext);
    } finally {
        fs.rmSync(tmp, {recursive: true, force: true});
    }
}

export function isResultEnvelopeBuffer (buf) {
    // Weak check — PK zip; decryptResultEnvelope falls back if members missing
    return Buffer.isBuffer(buf) && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

export {
    ENVELOPE_DATA,
    ENVELOPE_KEY,
    ENVELOPE_META,
    RESULT_DATA,
    RESULT_KEY,
    ALG,
    aesEncrypt,
    aesDecrypt,
    wrapKey,
    unwrapKey,
};
