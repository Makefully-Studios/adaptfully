import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.join(PACKAGE_ROOT, 'lib', 'runtime');

export function getPackageRoot() {
    return PACKAGE_ROOT;
}

export function getRuntimeDir() {
    return RUNTIME_DIR;
}

export function resolveRuntimeScript(relativePath) {
    return path.join(RUNTIME_DIR, relativePath);
}
