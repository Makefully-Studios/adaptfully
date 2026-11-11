/* global fetch, window */

/**
 * Device / PIN / QR auth for limited-input shells (LG webOS TV, etc.).
 *
 * TV build starts a short-lived session and polls. Companion sign-in happens on
 * the game's existing web deploy (not in the TV package).
 *
 * Config (adaptfully config / game-config):
 *   deviceAuthStartUrl      POST → { deviceCode, userCode, expiresIn, interval?, verificationUrl }
 *   deviceAuthPollUrl       GET  → { status, user? }  (append ?device_code=)
 *   deviceAuthCompanionBase optional base for QR if start omits verificationUrl
 *
 * Events: window 'adaptfully:device-auth' CustomEvent with detail
 *   { phase: 'pending'|'approved'|'expired'|'denied'|'error', userCode?, verificationUrl?, qrUrl?, expiresIn?, error? }
 *
 *   adaptfully.register('auth', adaptfully.auth.Device);
 */
(function registerDeviceAuth(ns) {
    const { configValue, getStorage } = ns.auth.helpers;

    const DEFAULT_AUTO_LOGIN_KEY = 'lastLoggedIn';
    const DEFAULT_USER_KEY = 'adaptfully_device_auth_user';
    const DEFAULT_INTERVAL_MS = 2000;

    class DeviceAuthPlugin {
        constructor() {
            this.name = 'device';
            this.user = null;
            this.authenticated = false;
            this._pending = null;
            this._pollTimer = null;
            this._loginInFlight = false;
        }

        supportsAutoLogin() {
            return true;
        }

        supportsLogout() {
            return true;
        }

        requiresEmail() {
            return true;
        }

        #autoLoginStorageKey() {
            return configValue('autoLoginStorageKey', DEFAULT_AUTO_LOGIN_KEY);
        }

        #userStorageKey() {
            return configValue('deviceAuthUserKey', DEFAULT_USER_KEY);
        }

        #startUrl() {
            return String(configValue('deviceAuthStartUrl', '') || '').trim();
        }

        #pollUrl() {
            return String(configValue('deviceAuthPollUrl', '') || '').trim();
        }

        #companionBase() {
            return String(configValue('deviceAuthCompanionBase', '') || '').trim();
        }

        #emit(detail) {
            try {
                window.dispatchEvent(new CustomEvent('adaptfully:device-auth', { detail }));
            } catch {
                // ignore
            }
        }

        #persistUser(user) {
            const storage = getStorage();
            if (!storage || !user?.id) {
                return;
            }
            storage.set(this.#autoLoginStorageKey(), user.id);
            try {
                storage.set(this.#userStorageKey(), JSON.stringify({
                    id: user.id,
                    email: user.email || '',
                }));
            } catch {
                // ignore
            }
        }

        #clearPersisted() {
            const storage = getStorage();
            storage?.remove(this.#autoLoginStorageKey());
            storage?.remove(this.#userStorageKey());
        }

        #readPersistedUser() {
            const storage = getStorage();
            const raw = storage?.get?.(this.#userStorageKey());
            if (!raw || typeof raw !== 'string') {
                return null;
            }
            try {
                const parsed = JSON.parse(raw);
                if (parsed?.id) {
                    return {
                        id: String(parsed.id),
                        email: String(parsed.email || ''),
                    };
                }
            } catch {
                // ignore
            }
            return null;
        }

        #stopPoll() {
            if (this._pollTimer != null) {
                window.clearTimeout(this._pollTimer);
                this._pollTimer = null;
            }
            this._pending = null;
        }

        #buildVerificationUrl(deviceCode, userCode, fromServer) {
            if (fromServer) {
                return String(fromServer);
            }
            const base = this.#companionBase();
            if (!base) {
                return '';
            }
            const join = base.includes('?') ? '&' : '?';
            const code = encodeURIComponent(deviceCode || userCode || '');
            return `${base}${join}code=${code}`;
        }

        whenReady(done) {
            if (!this.#startUrl() || !this.#pollUrl()) {
                done({
                    error: 'device-auth: deviceAuthStartUrl and deviceAuthPollUrl are required',
                });
                return;
            }
            done();
        }

        login(callback) {
            if (this.authenticated && this.user?.id) {
                callback({ authenticated: true, user: this.getUser() });
                return;
            }
            if (this._loginInFlight) {
                return;
            }
            this.#stopPoll();
            this._loginInFlight = true;

            fetch(this.#startUrl(), {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: '{}',
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`device-login start failed (${response.status})`);
                    }
                    return response.json();
                })
                .then((data) => {
                    const deviceCode = data.deviceCode || data.device_code;
                    const userCode = data.userCode || data.user_code;
                    const expiresIn = Number(data.expiresIn || data.expires_in || 600);
                    const intervalMs = Math.max(
                        1000,
                        Number(data.interval || data.intervalMs || DEFAULT_INTERVAL_MS),
                    );
                    const verificationUrl = this.#buildVerificationUrl(
                        deviceCode,
                        userCode,
                        data.verificationUrl || data.verification_url,
                    );

                    if (!deviceCode || !userCode) {
                        throw new Error('device-login start missing deviceCode/userCode');
                    }

                    this._pending = {
                        deviceCode,
                        userCode,
                        verificationUrl,
                        expiresAt: Date.now() + (expiresIn * 1000),
                        intervalMs,
                        callback,
                    };

                    this.#emit({
                        phase: 'pending',
                        userCode,
                        verificationUrl,
                        qrUrl: verificationUrl,
                        expiresIn,
                        deviceCode,
                    });

                    this.#schedulePoll();
                })
                .catch((err) => {
                    this._loginInFlight = false;
                    this.#emit({
                        phase: 'error',
                        error: err?.message || String(err),
                    });
                    callback({ authenticated: false, user: null });
                });
        }

        #schedulePoll() {
            const pending = this._pending;
            if (!pending) {
                return;
            }
            this._pollTimer = window.setTimeout(() => this.#pollOnce(), pending.intervalMs);
        }

        #pollOnce() {
            const pending = this._pending;
            if (!pending) {
                return;
            }

            if (Date.now() > pending.expiresAt) {
                this.#stopPoll();
                this._loginInFlight = false;
                this.#emit({ phase: 'expired', userCode: pending.userCode });
                pending.callback({ authenticated: false, user: null });
                return;
            }

            const url = new URL(this.#pollUrl(), window.location.href);
            url.searchParams.set('device_code', pending.deviceCode);

            fetch(url.toString(), { headers: { Accept: 'application/json' } })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`device-login poll failed (${response.status})`);
                    }
                    return response.json();
                })
                .then((data) => {
                    const status = String(data.status || '').toLowerCase();
                    if (status === 'approved' && data.user?.id) {
                        const user = {
                            id: String(data.user.id),
                            email: String(data.user.email || ''),
                        };
                        this.user = user;
                        this.authenticated = true;
                        this.#persistUser(user);
                        this.#emit({
                            phase: 'approved',
                            userCode: pending.userCode,
                            user,
                        });
                        const cb = pending.callback;
                        this.#stopPoll();
                        this._loginInFlight = false;
                        cb({ authenticated: true, user: this.getUser() });
                        return;
                    }
                    if (status === 'expired' || status === 'denied') {
                        this.#emit({
                            phase: status,
                            userCode: pending.userCode,
                        });
                        const cb = pending.callback;
                        this.#stopPoll();
                        this._loginInFlight = false;
                        cb({ authenticated: false, user: null });
                        return;
                    }
                    this.#schedulePoll();
                })
                .catch((err) => {
                    console.warn('[adaptfully device-auth] poll error', err);
                    this.#schedulePoll();
                });
        }

        autoLogin(callback) {
            const stored = this.#readPersistedUser();
            if (stored?.id) {
                this.user = stored;
                this.authenticated = true;
                callback({ authenticated: true, user: this.getUser() });
                return;
            }
            callback({ authenticated: false, user: null });
        }

        logout(callback) {
            this.#stopPoll();
            this._loginInFlight = false;
            this.authenticated = false;
            this.user = null;
            this.#clearPersisted();
            callback();
        }

        getUser() {
            if (!this.authenticated || !this.user) {
                return null;
            }
            return { id: this.user.id, email: this.user.email };
        }

        isAuthenticated() {
            return !!this.authenticated;
        }

        /** Cancel an in-progress PIN/QR login without logging out a restored session. */
        cancelLogin() {
            const pending = this._pending;
            this.#stopPoll();
            this._loginInFlight = false;
            if (pending?.callback) {
                this.#emit({ phase: 'denied', userCode: pending.userCode });
                pending.callback({ authenticated: false, user: null });
            }
        }
    }

    ns.auth.Device = () => new DeviceAuthPlugin();
}(window.adaptfully));
