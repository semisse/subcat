import { api } from '../ipc'
import { useAppVersion } from '../hooks/useUser'
import { Breadcrumb } from './Breadcrumb'
import { BellIcon } from './icons/BellIcon'
import logoUrl from '../../../assets/little-subcat.png'

export function TopBar() {
    const version = useAppVersion()
    return (
        <header className="top-bar">
            <div className="top-bar-left">
                <img src={logoUrl} alt="SubCat" className="top-bar-logo" />
                <Breadcrumb />
            </div>
            <div className="top-bar-right">
                <span
                    className="app-version"
                    role="button"
                    tabIndex={0}
                    onClick={() => void api.showAbout()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void api.showAbout()
                        }
                    }}
                >
                    {version ? `v${version}` : ''}
                </span>
                <button className="notif-btn" title="Notifications" type="button">
                    <BellIcon />
                </button>
            </div>
        </header>
    )
}
