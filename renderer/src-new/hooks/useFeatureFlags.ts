import { useEffect } from 'react'
import { api } from '../ipc'
import { useAppStore } from '../store/app'

export function useFeatureFlags() {
    const flags = useAppStore((s) => s.featureFlags)
    const setFlags = useAppStore((s) => s.setFeatureFlags)

    useEffect(() => {
        void api.getFeatureFlags().then(setFlags)
    }, [setFlags])

    return flags
}
