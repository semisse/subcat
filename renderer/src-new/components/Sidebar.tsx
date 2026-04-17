import { useRoute } from '../router'
import { useUser } from '../hooks/useUser'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { NAV_ITEMS, PROFILE_ROUTE } from '../routes'

export function Sidebar() {
    const { path, navigate } = useRoute()
    const flags = useFeatureFlags()
    const user = useUser()

    const displayName = user.loggedIn ? user.login : 'Guest'
    const displayEmail = user.loggedIn
        ? user.email || `${user.login}@github.com`
        : 'Not signed in'

    return (
        <aside className="sidebar">
            <nav className="sidebar-nav">
                {NAV_ITEMS.map((item) => {
                    if (item.flag && !flags[item.flag]) return null
                    const isActive = path === item.path
                    const Icon = item.icon
                    return (
                        <a
                            key={item.path}
                            href={`#${item.path}`}
                            className={isActive ? 'nav-item active' : 'nav-item'}
                            onClick={(e) => {
                                e.preventDefault()
                                navigate(item.path)
                            }}
                        >
                            <Icon />
                            {item.label}
                            {item.beta && <span className="nav-beta-pill">beta</span>}
                        </a>
                    )
                })}
            </nav>
            <div className="sidebar-footer">
                <div
                    className="sidebar-user"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(PROFILE_ROUTE.path)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate(PROFILE_ROUTE.path)
                        }
                    }}
                >
                    {user.loggedIn && user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" />
                    ) : null}
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{displayName}</div>
                        <div className="sidebar-user-email">{displayEmail}</div>
                    </div>
                </div>
            </div>
        </aside>
    )
}
