import type { ComponentType, SVGProps } from 'react'
import { HomeIcon } from './components/icons/HomeIcon'
import { PullRequestIcon } from './components/icons/PullRequestIcon'
import { EyeIcon } from './components/icons/EyeIcon'
import { ReportsIcon } from './components/icons/ReportsIcon'
import { LabTestIcon } from './components/icons/LabTestIcon'
import { LabRunsIcon } from './components/icons/LabRunsIcon'

export type NavItem = {
    path: string
    label: string
    breadcrumb: string
    icon: ComponentType<SVGProps<SVGSVGElement>>
    beta?: boolean
    flag?: string
}

export const NAV_ITEMS: NavItem[] = [
    { path: '/home', label: 'Home', breadcrumb: 'Dashboard', icon: HomeIcon },
    { path: '/my-prs', label: 'My PRs', breadcrumb: 'My PRs', icon: PullRequestIcon },
    { path: '/runs', label: 'Watching', breadcrumb: 'Watching', icon: EyeIcon },
    { path: '/reports', label: 'Reports', breadcrumb: 'Reports', icon: ReportsIcon },
    { path: '/lab-test', label: 'Lab Test', breadcrumb: 'Lab Test', icon: LabTestIcon, beta: true },
    { path: '/lab-runs', label: 'Lab Runs', breadcrumb: 'Lab Runs', icon: LabRunsIcon, flag: 'lab-runs' },
]

export const PROFILE_ROUTE = { path: '/profile', breadcrumb: 'Profile' } as const

export function breadcrumbFor(path: string): string | null {
    if (path === '/home') return null
    if (path === PROFILE_ROUTE.path) return PROFILE_ROUTE.breadcrumb
    const item = NAV_ITEMS.find((i) => i.path === path)
    return item?.breadcrumb ?? null
}
