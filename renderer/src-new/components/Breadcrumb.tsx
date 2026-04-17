import { useRoute } from '../router'
import { breadcrumbFor } from '../routes'

export function Breadcrumb() {
    const { path, navigate } = useRoute()
    const current = breadcrumbFor(path)
    const onHome = path === '/home'

    return (
        <div className="breadcrumb">
            <span
                className={onHome ? 'breadcrumb-item current' : 'breadcrumb-item'}
                role="button"
                tabIndex={0}
                style={{ cursor: onHome ? 'default' : 'pointer' }}
                onClick={() => navigate('/home')}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate('/home')
                    }
                }}
            >
                Home
            </span>
            {current && (
                <>
                    <span className="breadcrumb-separator">/</span>
                    <span className="breadcrumb-item">{current}</span>
                </>
            )}
        </div>
    )
}
