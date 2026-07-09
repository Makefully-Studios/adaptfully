import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const STEAMCMD_INSTALL = {
    win32: {
        url: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',
        archive: 'zip',
    },
    linux: {
        url: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz',
        archive: 'tar.gz',
    },
    darwin: {
        url: 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz',
        archive: 'tar.gz',
    },
};

/**
 * @param {string} [projectRoot]
 */
export function defaultSteamPublishPath(projectRoot = '.') {
    return path.resolve(projectRoot, 'assets', 'meta', 'deployments', 'steam', 'steam.json');
}

/**
 * @param {string} [cacheRoot]
 */
export function defaultSteamcmdCacheDir(cacheRoot) {
    const root = cacheRoot ?? path.join(os.homedir(), '.adaptfully', 'steamcmd');

    return path.join(root, process.platform);
}

/**
 * @param {{ username: string, password: string, configVdfBuffer?: Buffer, sentryFileName?: string, sentryFileBuffer?: Buffer }} auth
 */
export function buildSteamPublishJson(auth) {
    /** @type {Record<string, string>} */
    const result = {
        username: auth.username,
        password: auth.password,
    };

    if (auth.configVdfBuffer) {
        result.configVdf = auth.configVdfBuffer.toString('base64');
    }

    if (auth.sentryFileName && auth.sentryFileBuffer) {
        result.sentryFileName = auth.sentryFileName;
        result.sentryFile = auth.sentryFileBuffer.toString('base64');
    }

    return result;
}

/**
 * @param {string} steamcmdDir
 */
export async function collectSteamAuthFiles(steamcmdDir) {
    const configPath = path.join(steamcmdDir, 'config', 'config.vdf');
    let configVdfBuffer;

    try {
        configVdfBuffer = await fsp.readFile(configPath);
    } catch {
        throw new Error(
            `Steam login did not produce config/config.vdf at "${configPath}". `
            + 'Check your username, password, and Steam Guard code.',
        );
    }

    const entries = await fsp.readdir(steamcmdDir);
    const sentryFileName = entries.find((name) => name.startsWith('ssfn'));
    let sentryFileBuffer;

    if (sentryFileName) {
        sentryFileBuffer = await fsp.readFile(path.join(steamcmdDir, sentryFileName));
    }

    return { configVdfBuffer, sentryFileName, sentryFileBuffer };
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit' });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`"${command}" exited with code ${code}`));
            }
        });
    });
}

/**
 * @param {string} url
 * @param {string} dest
 */
async function downloadFile(url, dest) {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
        throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
    }

    await pipeline(response.body, createWriteStream(dest));
}

/**
 * @param {string} archivePath
 * @param {string} destDir
 * @param {'zip' | 'tar.gz'} archiveType
 */
async function extractArchive(archivePath, destDir, archiveType) {
    await fsp.mkdir(destDir, { recursive: true });

    if (archiveType === 'tar.gz') {
        await runCommand('tar', ['-xzf', archivePath, '-C', destDir]);
        return;
    }

    if (process.platform === 'win32') {
        const escapedArchive = archivePath.replace(/'/g, "''");
        const escapedDest = destDir.replace(/'/g, "''");

        await runCommand('powershell', [
            '-NoProfile',
            '-Command',
            `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedDest}' -Force`,
        ]);
        return;
    }

    await runCommand('tar', ['-xf', archivePath, '-C', destDir]);
}

/**
 * @param {string} cacheDir
 */
export function steamcmdExecutable(cacheDir) {
    if (process.platform === 'win32') {
        return path.join(cacheDir, 'steamcmd.exe');
    }

    return path.join(cacheDir, 'steamcmd.sh');
}

/**
 * @param {string} cacheDir
 */
async function steamcmdIsInstalled(cacheDir) {
    const executable = steamcmdExecutable(cacheDir);

    try {
        await fsp.access(executable);
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {string} cacheDir
 * @param {(message: string) => void} [log]
 */
export async function ensureSteamcmd(cacheDir, log = console.log) {
    if (await steamcmdIsInstalled(cacheDir)) {
        log(`adaptfully: using steamcmd at ${steamcmdExecutable(cacheDir)}`);
        return cacheDir;
    }

    const install = STEAMCMD_INSTALL[process.platform];

    if (!install) {
        throw new Error(`Steamcmd install is not supported on platform "${process.platform}".`);
    }

    await fsp.mkdir(cacheDir, { recursive: true });

    const archiveName = install.archive === 'zip' ? 'steamcmd.zip' : 'steamcmd.tar.gz';
    const archivePath = path.join(cacheDir, archiveName);

    log(`adaptfully: downloading steamcmd from ${install.url}`);
    await downloadFile(install.url, archivePath);
    log('adaptfully: extracting steamcmd...');
    await extractArchive(archivePath, cacheDir, install.archive);
    await fsp.unlink(archivePath).catch(() => {});

    if (!await steamcmdIsInstalled(cacheDir)) {
        throw new Error(`Steamcmd install failed; expected executable at ${steamcmdExecutable(cacheDir)}`);
    }

    if (process.platform !== 'win32') {
        await fsp.chmod(steamcmdExecutable(cacheDir), 0o755);
    }

    log(`adaptfully: installed steamcmd to ${cacheDir}`);
    return cacheDir;
}

/**
 * @param {string} cacheDir
 * @param {string} username
 * @param {string} password
 */
export function runSteamcmdLogin(cacheDir, username, password) {
    const executable = steamcmdExecutable(cacheDir);
    const args = ['+login', username, password, '+quit'];
    const command = process.platform === 'win32' ? executable : executable;
    const spawnCommand = process.platform === 'win32' ? command : 'bash';
    const spawnArgs = process.platform === 'win32' ? args : [command, ...args];

    return new Promise((resolve, reject) => {
        console.log('');
        console.log('Steamcmd is starting. If Steam Guard is enabled, enter the code when prompted.');
        console.log('');

        const child = spawn(spawnCommand, spawnArgs, {
            cwd: cacheDir,
            stdio: 'inherit',
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`steamcmd login failed with exit code ${code}`));
            }
        });
    });
}

/**
 * @param {string[]} argv
 */
function parseSteamAuthArgv(argv) {
    /** @type {Record<string, string>} */
    const options = {
        projectRoot: '.',
    };

    for (let i = 3; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--username' && argv[i + 1]) {
            options.username = argv[++i];
        } else if (arg === '--password' && argv[i + 1]) {
            options.password = argv[++i];
        } else if (arg === '--output' && argv[i + 1]) {
            options.output = argv[++i];
        } else if (arg === '--steamcmd-dir' && argv[i + 1]) {
            options.steamcmdDir = argv[++i];
        } else if (arg === '--project-root' && argv[i + 1]) {
            options.projectRoot = argv[++i];
        }
    }

    return options;
}

/**
 * @param {{ username?: string, password?: string, output?: string, steamcmdDir?: string, projectRoot?: string, log?: (message: string) => void }} [options]
 */
export async function runSteamAuth(options = {}) {
    const log = options.log ?? console.log;
    const username = options.username
        ?? process.env.STEAM_USERNAME
        ?? process.env.STEAM_BUILD_USERNAME;
    const password = options.password
        ?? process.env.STEAM_PASSWORD
        ?? process.env.STEAM_BUILD_PASSWORD;
    const outputPath = path.resolve(options.output ?? defaultSteamPublishPath(options.projectRoot ?? '.'));
    const cacheDir = options.steamcmdDir ?? defaultSteamcmdCacheDir();

    let resolvedUsername = username;
    let resolvedPassword = password;

    if (!resolvedUsername || !resolvedPassword) {
        const rl = readline.createInterface({ input, output });

        try {
            if (!resolvedUsername) {
                resolvedUsername = await rl.question('Steam build account username: ');
            }

            if (!resolvedPassword) {
                resolvedPassword = await rl.question('Steam build account password: ');
            }
        } finally {
            rl.close();
        }
    }

    resolvedUsername = String(resolvedUsername).trim();
    resolvedPassword = String(resolvedPassword);

    if (!resolvedUsername || !resolvedPassword) {
        throw new Error('Steam username and password are required.');
    }

    await ensureSteamcmd(cacheDir, log);
    await runSteamcmdLogin(cacheDir, resolvedUsername, resolvedPassword);

    const authFiles = await collectSteamAuthFiles(cacheDir);
    const steamJson = buildSteamPublishJson({
        username: resolvedUsername,
        password: resolvedPassword,
        ...authFiles,
    });

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.writeFile(outputPath, `${JSON.stringify(steamJson, null, 4)}\n`);

    log(`adaptfully: wrote ${outputPath}`);
    if (authFiles.sentryFileName) {
        log(`adaptfully: included Steam Guard sentry file ${authFiles.sentryFileName}`);
    } else {
        log('adaptfully: no sentry file was created (Steam Guard may be disabled on this account)');
    }

    return { outputPath, steamJson };
}

/**
 * @param {string[]} [argv]
 */
export async function steamAuthFromCli(argv = process.argv) {
    return runSteamAuth(parseSteamAuthArgv(argv));
}
