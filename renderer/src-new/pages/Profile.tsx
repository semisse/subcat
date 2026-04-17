import { api } from '../ipc'

export function Profile() {
    return (
        <div>
            <h2>Profile</h2>
            <button
                className="logout-btn"
                type="button"
                onClick={() => void api.authLogout()}
            >
                Sign Out
            </button>
        </div>
    )
}
