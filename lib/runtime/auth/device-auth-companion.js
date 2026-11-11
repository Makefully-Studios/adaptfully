/* global fetch, window */

/**
 * Optional helpers for a web companion page that completes device-auth sessions.
 * Not registered as an Adaptfully plugin — include on the companion page only.
 *
 * Usage:
 *   const code = adaptfully.auth.deviceCompanion.readCodeFromLocation();
 *   await adaptfully.auth.deviceCompanion.complete({
 *     completeUrl, deviceCode or userCode, plusId, email, userId?
 *   });
 */
(function registerDeviceAuthCompanion(ns) {
    ns.auth = ns.auth || {};

    /**
     * @returns {string}
     */
    function readCodeFromLocation() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            return String(params.get('code') || params.get('user_code') || params.get('pin') || '').trim();
        } catch {
            return '';
        }
    }

    /**
     * @param {{
     *   completeUrl: string,
     *   deviceCode?: string,
     *   userCode?: string,
     *   plusId: string,
     *   email: string,
     *   userId?: string,
     * }} options
     */
    async function complete(options) {
        const completeUrl = String(options?.completeUrl || '').trim();
        if (!completeUrl) {
            throw new Error('deviceCompanion.complete requires completeUrl');
        }
        const body = {
            device_code: options.deviceCode || undefined,
            user_code: options.userCode || undefined,
            plusId: options.plusId,
            email: options.email,
            user_id: options.userId || undefined,
        };
        const response = await fetch(completeUrl, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`device-login complete failed (${response.status}): ${text}`);
        }
        return response.json().catch(() => ({ ok: true }));
    }

    ns.auth.deviceCompanion = {
        readCodeFromLocation,
        complete,
    };
}(window.adaptfully || (window.adaptfully = {})));
