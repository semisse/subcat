import type { WindowApi } from '../../../src/shared/ipc';

declare global {
    interface Window {
        api: WindowApi;
    }
}

export {};
