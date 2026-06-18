#!/usr/bin/env node
import { loadProjectConfig, resolveServerUrl } from '../lib/node/config.js';
import { runAdaptfullyStage } from '../lib/node/pipeline.js';
import { resolveCliPlatformAndBuilder } from '../lib/node/registrations.js';

const arg = process.argv[2] ?? 'steam';
const cliServer = process.argv[3];
const mode = process.argv[4] ?? 'extract';

const { pkg, wrapfullyConfig } = await loadProjectConfig();
const { platformKey, builder } = resolveCliPlatformAndBuilder(arg, pkg);

runAdaptfullyStage('deploy', platformKey, {
    pkg,
    deployFolder: pkg.config?.deployFolder || 'deploy',
    server: resolveServerUrl(wrapfullyConfig, cliServer),
    mode,
    builder,
}).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
