import { useEffect } from 'react'
import { api } from '../ipc'
import { useAppStore } from '../store/app'

export function useUser() {
    const user = useAppStore((s) => s.user)
    const setUser = useAppStore((s) => s.setUser)

    useEffect(() => {
        void api.authGetStatus().then(setUser)
        const off = api.onAuthLoggedIn(() => {
            void api.authGetStatus().then(setUser)
        })
        return off
    }, [setUser])

    return user
}

export function useAppVersion() {
    const version = useAppStore((s) => s.appVersion)
    const setVersion = useAppStore((s) => s.setAppVersion)

    useEffect(() => {
        void api.getVersion().then(setVersion)
    }, [setVersion])

    return version
}
