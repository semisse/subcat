import { useEffect } from 'react';

// Subscribes to a `window.api.on*` channel for the lifetime of the component.
//
// Usage:
//   useIpcSubscription(api.onRunUpdate, (data) => { ... }, [deps]);
//
// The subscribe function must return an unsubscribe function — which every
// `on*` method on window.api does after the Phase 1 preload refactor.
//
// The callback is NOT a dep by default because callers almost always define
// it inline and would force a resubscribe every render. Pass `deps` if you
// need finer control.

export function useIpcSubscription<T>(
    subscribe: (callback: (data: T) => void) => () => void,
    callback: (data: T) => void,
    deps: ReadonlyArray<unknown> = [],
): void {
    useEffect(() => {
        const unsubscribe = subscribe(callback);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}

// Variant for void events (open-new-watch has no payload).
export function useIpcVoidSubscription(
    subscribe: (callback: () => void) => () => void,
    callback: () => void,
    deps: ReadonlyArray<unknown> = [],
): void {
    useEffect(() => {
        const unsubscribe = subscribe(callback);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
