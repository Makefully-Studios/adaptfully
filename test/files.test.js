import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getRuntimeDir } from '../lib/node/paths.js';
import { STANDARD_PLUGINS } from '../lib/node/registrations.js';

const runtimeDir = getRuntimeDir();

function loadFilesPlugin(pluginKey, extras = {}) {
    const plugin = STANDARD_PLUGINS[pluginKey];
    const context = {
        adaptfully: undefined,
        console,
        window: undefined,
        Blob,
        File,
        atob,
        btoa,
        Uint8Array,
        ArrayBuffer,
        setTimeout,
        URL,
        fetch: async () => {
            throw new Error('unexpected fetch');
        },
        ...extras,
    };
    context.window = context;

    for (const relative of plugin.scripts) {
        const code = fs.readFileSync(`${runtimeDir}/${relative}`, 'utf8');
        vm.runInNewContext(code, context, { filename: relative });
    }

    vm.runInNewContext(plugin.registration('files'), context);
    return context.adaptfully.get('files');
}

describe('files plugins', () => {
    it('registers web-files, electron-files, capacitor-files, and noop-files', () => {
        assert.ok(STANDARD_PLUGINS['web-files']);
        assert.ok(STANDARD_PLUGINS['electron-files']);
        assert.ok(STANDARD_PLUGINS['capacitor-files']);
        assert.ok(STANDARD_PLUGINS['noop-files']);
    });

    it('noop-files always returns null', async () => {
        const files = loadFilesPlugin('noop-files');
        assert.equal(files.name, 'noop');
        assert.equal(await files.open(), null);
        assert.equal(await files.save({ name: 'x.txt', blob: new Blob(['hi']) }), null);
    });

    it('electron-files returns null when bridge is absent', async () => {
        const files = loadFilesPlugin('electron-files');
        assert.equal(files.name, 'electron');
        assert.equal(await files.open(), null);
        assert.equal(await files.save({ name: 'x.txt', blob: new Blob(['hi']) }), null);
    });

    it('electron-files open/save use __ADAPTFULLY_FILES__', async () => {
        const blob = new Blob(['hello'], { type: 'text/plain' });
        const files = loadFilesPlugin('electron-files', {
            __ADAPTFULLY_FILES__: {
                async open() {
                    return {
                        files: [{
                            name: 'note.txt',
                            mimeType: 'text/plain',
                            size: 5,
                            base64: Buffer.from('hello').toString('base64'),
                        }],
                    };
                },
                async save(options) {
                    assert.equal(options.name, 'out.txt');
                    assert.ok(options.base64);
                    return { name: 'out.txt' };
                },
            },
        });

        const opened = await files.open();
        assert.equal(opened.files.length, 1);
        assert.equal(opened.files[0].name, 'note.txt');
        assert.equal(opened.files[0].mimeType, 'text/plain');
        assert.ok(opened.files[0].blob instanceof Blob);

        const saved = await files.save({ name: 'out.txt', mimeType: 'text/plain', blob });
        assert.ok(saved);
        assert.equal(saved.name, 'out.txt');
    });

    it('capacitor-files open uses FilePicker.pickFiles', async () => {
        const files = loadFilesPlugin('capacitor-files', {
            Capacitor: {
                Plugins: {
                    FilePicker: {
                        async pickFiles(options) {
                            assert.equal(options.limit, 1);
                            assert.equal(options.readData, true);
                            return {
                                files: [{
                                    name: 'save.json',
                                    mimeType: 'application/json',
                                    data: Buffer.from('{"a":1}').toString('base64'),
                                }],
                            };
                        },
                    },
                },
            },
        });

        const opened = await files.open({ types: ['application/json'] });
        assert.equal(opened.files[0].name, 'save.json');
        assert.ok(opened.files[0].blob instanceof Blob);
    });

    it('capacitor-files save writes cache then Share', async () => {
        const calls = [];
        const files = loadFilesPlugin('capacitor-files', {
            Capacitor: {
                Plugins: {
                    Filesystem: {
                        async writeFile(opts) {
                            calls.push(['write', opts]);
                            return { uri: 'file:///cache/export.json' };
                        },
                    },
                    Share: {
                        async share(opts) {
                            calls.push(['share', opts]);
                        },
                    },
                },
            },
        });

        const saved = await files.save({
            name: 'export.json',
            mimeType: 'application/json',
            blob: new Blob(['{}'], { type: 'application/json' }),
        });
        assert.ok(saved);
        assert.equal(saved.name, 'export.json');
        assert.equal(calls[0][0], 'write');
        assert.equal(calls[1][0], 'share');
        assert.equal(calls[1][1].files[0], 'file:///cache/export.json');
    });

    it('capacitor-files maps cancel errors to null', async () => {
        const files = loadFilesPlugin('capacitor-files', {
            Capacitor: {
                Plugins: {
                    FilePicker: {
                        async pickFiles() {
                            const err = new Error('pick cancelled by user');
                            err.code = 'ERROR_PICK_FILE_CANCELED';
                            throw err;
                        },
                    },
                },
            },
        });
        assert.equal(await files.open(), null);
    });
});
