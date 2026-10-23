/**
 * Make a single filesystem / URL path segment safe.
 * Strips `@`, turns `/` and `\` into `-`, and removes other Windows-illegal chars
 * so scoped npm names like `@makefully/fancifully` stay flat.
 *
 * @param {unknown} value
 * @param {string} [fallback='app']
 * @returns {string}
 */
export function sanitizeFsSegment(value, fallback = 'app') {
    const cleaned = String(value ?? '')
        .replace(/@/g, '')
        .replace(/[/\\]+/g, '-')
        .replace(/[<>:"|?*\u0000-\u001f]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    return cleaned || fallback;
}

/**
 * Build the Adaptfully/Wrapfully gameId from package name + version.
 * @param {string} name
 * @param {string} version
 * @returns {string}
 */
export function buildGameId(name, version) {
    return sanitizeFsSegment(`${name}-${version}`, 'app');
}
