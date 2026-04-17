import { create } from 'zustand'
import type { AuthStatus, FeatureFlags, PR } from '../../../src/shared/ipc'

export type AppState = {
    user: AuthStatus
    featureFlags: FeatureFlags
    appVersion: string
    currentPR: PR | null
    setUser: (user: AuthStatus) => void
    setFeatureFlags: (flags: FeatureFlags) => void
    setAppVersion: (version: string) => void
    setCurrentPR: (pr: PR | null) => void
}

export const useAppStore = create<AppState>((set) => ({
    user: { loggedIn: false },
    featureFlags: {},
    appVersion: '',
    currentPR: null,
    setUser: (user) => set({ user }),
    setFeatureFlags: (featureFlags) => set({ featureFlags }),
    setAppVersion: (appVersion) => set({ appVersion }),
    setCurrentPR: (currentPR) => set({ currentPR }),
}))
