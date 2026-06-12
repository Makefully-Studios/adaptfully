#!/usr/bin/env node
/* eslint-disable no-sync */
/* global console, process, require */
const
    archiver = require('archiver'),
    fs = require('fs'),
    axios = require('axios'),
    unzipper = require('unzip-stream'),
    DEFAULT_SERVER = 'http://localhost:9630/',
    archive = function (deployFolder, contents) {
        var archive = archiver('zip', {
            zlib: {
                level: 0
            }
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                console.log(err);
            } else {
                throw err;
            }
        });
        archive.on('error', function (err) {
            throw err;
        });
        // 'close' event is fired only when a file descriptor is involved
        archive.on('close', function () {
            console.log('Zipped ' + archive.pointer() + ' total bytes');
        });

        archive.directory(`${deployFolder}/`, 'deploy');
        archive.file(`${deployFolder}/index.html`, {name: 'deploy/index.html'});
        if (fs.existsSync('assets/meta/')) {
            archive.directory('assets/meta/', 'meta');
        }
        archive.append(contents, {name: 'package.json'});

        archive.finalize();

        return archive;
    },
    printBuildReport = function (builder, pkg) {
        const
            statusPath = './output/wrapfully-status.json',
            legacyPath = `./output/${pkg.name}-${pkg.version}-${builder}.txt`;
        let status = null;

        if (fs.existsSync(statusPath)) {
            try {
                status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            } catch (err) {
                console.warn('Unable to read wrapfully-status.json');
            }
        }

        if (status) {
            for (let i = 0; i < status.events.length; i++) {
                const event = status.events[i],
                    line = `[${event.step}] ${event.message}`;

                if (event.level === 'error') {
                    console.error(line);
                } else if (event.level === 'warn') {
                    console.warn(line);
                } else {
                    console.log(line);
                }
            }

            if (!status.ok) {
                console.error('Wrapfully build finished with errors.');
                process.exit(1);
            }

            return;
        }

        if (fs.existsSync(legacyPath)) {
            console.log(fs.readFileSync(legacyPath, 'utf8'));
        }
    },
    send = async function (gameId, contents, server, builder, deployFolder, pkg) {
        const
            dst = autoExtract === 'extract' ? unzipper.Extract({
                path: './output/',
                concurrency: 1
            }) : fs.createWriteStream(`./output/${pkg.name}-${pkg.version}-${builder}.zip`),
            archiveStream = archive(deployFolder, contents),
            {data} = await axios.post(server + builder + '/' + gameId, archiveStream, {
                maxRedirects: 0, // avoid buffering the entire stream
                responseType: 'stream'
            });

        archiveStream.on('close', function () {
            console.log('completed send');
        });

        await new Promise((resolve, reject) => {
            data.on('error', function (err) {
                if (err.code === 'ECONNREFUSED') {
                    console.error(`Cannot connect to Wrapfully server "${server}"`);
                    process.exit(1);
                } else {
                    reject(err);
                }
            });
            dst.on('error', reject);
            dst.on('close', resolve);
            data.pipe(dst);
        });

        if (autoExtract === 'extract') {
            printBuildReport(builder, pkg);
        }
    },
    args = process.argv,
    builder = args[2] ?? 'all',
    cliServer = args[3],
    autoExtract = args[4] ?? 'extract';

fs.readFile('./package.json', (err, data) => {
    if (err) {
        throw err;
    }

    const pkg = JSON.parse(data);

    fs.readFile('./wrapfully.json', (err, wrapfullyData) => {
        const wrapfullyConfig = err ? {} : JSON.parse(wrapfullyData);

        pkg.config = {
            ...pkg.config,
            ...wrapfullyConfig
        };

        const server = (
            cliServer ||
            process.env.WRAPFULLY_SERVER ||
            wrapfullyConfig.server ||
            DEFAULT_SERVER
        ).replace(/\/?$/, '/');

        send(
            `${pkg.name}-${pkg.version}`,
            JSON.stringify(pkg),
            server,
            builder,
            pkg.config.deployFolder || 'deploy',
            pkg
        );
    });
});
