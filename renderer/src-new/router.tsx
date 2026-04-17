import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type RoutePath = string

type RouterContextValue = {
    path: RoutePath
    navigate: (to: RoutePath) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

const DEFAULT_PATH: RoutePath = '/home'
const STORAGE_KEY = 'subcat:route'

function readPath(): RoutePath {
    const hash = window.location.hash.replace(/^#/, '')
    if (hash) return hash
    try {
        const stored = sessionStorage.getItem(STORAGE_KEY)
        if (stored) return stored
    } catch {
        // sessionStorage may be unavailable
    }
    return DEFAULT_PATH
}

function persist(path: RoutePath) {
    try {
        sessionStorage.setItem(STORAGE_KEY, path)
    } catch {
        // sessionStorage may be unavailable
    }
}

export function Router({ children }: { children: ReactNode }) {
    const [path, setPath] = useState<RoutePath>(() => readPath())

    useEffect(() => {
        const sync = () => {
            const next = readPath()
            persist(next)
            setPath(next)
        }
        window.addEventListener('hashchange', sync)
        return () => window.removeEventListener('hashchange', sync)
    }, [])

    useEffect(() => {
        if (!window.location.hash) {
            window.location.hash = path
        }
        persist(path)
    }, [path])

    const value = useMemo<RouterContextValue>(
        () => ({
            path,
            navigate: (to) => {
                if (to === path) return
                persist(to)
                window.location.hash = to
            },
        }),
        [path],
    )

    return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRoute(): RouterContextValue {
    const ctx = useContext(RouterContext)
    if (!ctx) throw new Error('useRoute must be used inside <Router>')
    return ctx
}

export function Route({ path, children }: { path: RoutePath; children: ReactNode }) {
    const { path: active } = useRoute()
    return active === path ? <>{children}</> : null
}
