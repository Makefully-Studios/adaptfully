#!/usr/bin/env node
import { adaptfullyFromCli } from '../lib/node/pipeline.js';

adaptfullyFromCli().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
