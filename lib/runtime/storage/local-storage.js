/* global localStorage, window */

(function registerLocalStorage(ns) {
    ns.storage.LocalStorage = function localStorageFactory() {
        return {
            name: 'localStorage',
            get(field) {
                try {
                    const value = localStorage.getItem(field);
                    return value === null ? false : value;
                } catch {
                    return false;
                }
            },
            set(field, value) {
                this.remove(field);
                try {
                    localStorage.setItem(field, value);
                } catch {
                    // quota or private browsing
                }
            },
            remove(field) {
                try {
                    localStorage.removeItem(field);
                } catch {
                    // ignore
                }
            },
            getObject(field) {
                const raw = this.get(field);
                if (!raw) {
                    return false;
                }
                try {
                    return JSON.parse(raw);
                } catch {
                    return false;
                }
            },
            setObject(field, obj) {
                try {
                    this.set(field, JSON.stringify(obj));
                } catch {
                    // ignore
                }
            },
        };
    };
}(window.adaptfully));
