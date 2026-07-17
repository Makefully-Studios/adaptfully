import fs from 'node:fs';
import path from 'node:path';
import { Packager } from './base.js';

const CAPACITOR_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src * \'self\' data: blob: \'unsafe-inline\' \'unsafe-eval\'; style-src * \'self\' \'unsafe-inline\'; script-src * \'self\' \'unsafe-inline\' \'unsafe-eval\'; connect-src *; img-src * data: blob:; media-src * data: blob:; frame-src *;" />';

const CAPACITOR_VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />';

/**
 * @param {string | null | undefined} platformKey
 * @param {{ config?: { platforms?: Record<string, { socialLogin?: object }> } }} pkg
 */
export function resolvePlatformSocialLogin(platformKey, pkg) {
    if (!platformKey) {
        return undefined;
    }
    return pkg.config?.platforms?.[platformKey]?.socialLogin;
}

/**
 * @param {object} socialLogin
 * @param {string} platformKey
 */
function normalizeSocialLoginConfig(socialLogin = {}, platformKey) {
    const providers = socialLogin.providers ?? { google: true, apple: true };
    const googleEnabled = providers.google !== false;
    const appleEnabled = providers.apple !== false;

    let defaultProvider = socialLogin.defaultProvider;
    if (!defaultProvider) {
        if (platformKey === 'ios' || platformKey === 'ios-dev' || platformKey === 'ios-sim') {
            defaultProvider = appleEnabled ? 'apple' : 'google';
        } else {
            defaultProvider = googleEnabled ? 'google' : 'apple';
        }
    }

    return {
        providers: {
            google: googleEnabled,
            apple: appleEnabled,
            facebook: providers.facebook === true,
            twitter: providers.twitter === true,
        },
        google: socialLogin.google ?? {},
        apple: socialLogin.apple ?? {},
        defaultProvider,
        platform: platformKey,
    };
}

/**
 * @param {object} config
 */
function validateSocialLoginConfig(config) {
    const { providers, google, apple } = config;

    if (!providers.google && !providers.apple) {
        throw new Error('social-auth requires at least one of socialLogin.providers.google or .apple');
    }

    if (providers.google) {
        if (!google?.webClientId) {
            throw new Error(
                'social-auth with Google requires platforms.<key>.socialLogin.google.webClientId',
            );
        }
    }

    if (providers.apple && config.platform?.startsWith('android')) {
        if (!apple?.clientId) {
            throw new Error(
                'social-auth with Apple on Android requires platforms.<key>.socialLogin.apple.clientId',
            );
        }
    }
}

export class CapacitorPackager extends Packager {
    /** @type {'capacitor'} */
    static id = 'capacitor';

    /** @type {string[]} */
    static defaultPlatforms = ['ios', 'android'];

    validate() {
        super.validate();

        if (this.usesPlugin('social-auth')) {
            const socialLogin = resolvePlatformSocialLogin(this.platformKey, this.pkg);
            if (!socialLogin && !this.pkg.config?.socialLogin) {
                const platformLabel = this.platformKey ?? this.platforms.join(', ');
                throw new Error(
                    `Platform "${platformLabel}" uses social-auth but platforms.${platformLabel}.socialLogin is not set.`,
                );
            }

            const config = normalizeSocialLoginConfig(
                socialLogin ?? this.pkg.config?.socialLogin,
                this.platformKey ?? 'android',
            );
            validateSocialLoginConfig(config);
        }
    }

    needsGameConfig() {
        return true;
    }

    /** @param {string} dest */
    applyTemplates(dest) {
        if (this.usesPlugin('social-auth') && this.platformKey) {
            const socialLogin = resolvePlatformSocialLogin(this.platformKey, this.pkg)
                ?? this.pkg.config?.socialLogin
                ?? {};
            const config = normalizeSocialLoginConfig(socialLogin, this.platformKey);
            const content = `window.__ADAPTFULLY_SOCIAL_LOGIN__ = ${JSON.stringify(config, null, 4)};\n`;
            fs.writeFileSync(path.join(dest, 'social-login-config.js'), content);
            this.log('adaptfully: write social-login-config.js (social-auth)');
        }

        super.applyTemplates(dest);
    }

    buildHtmlInjection() {
        const headExtras = [CAPACITOR_CSP, CAPACITOR_VIEWPORT];
        const bodyScripts = [];

        if (this.usesPlugin('social-auth')) {
            bodyScripts.push('<script src="social-login-config.js"></script>');
        }

        if (this.needsGameConfig()) {
            bodyScripts.push('<script src="game-config.js"></script>');
        }

        return this.formatHtmlInjection(headExtras, bodyScripts);
    }
}
