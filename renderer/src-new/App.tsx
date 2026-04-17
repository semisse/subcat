import { useEffect, useState } from 'react'
import { api } from './ipc'

export default function App() {
    const [version, setVersion] = useState<string>('')

    useEffect(() => {
        api.getVersion().then(setVersion)
    }, [])

    return (
        <div>
            <h1>SubCat (new renderer)</h1>
            {version && <p>v{version}</p>}
        </div>
    )
}
