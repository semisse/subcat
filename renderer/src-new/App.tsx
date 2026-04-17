import { Router, Route } from './router'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Home } from './pages/Home'
import { MyPrs } from './pages/MyPrs'
import { Runs } from './pages/Runs'
import { Reports } from './pages/Reports'
import { LabTest } from './pages/LabTest'
import { LabRuns } from './pages/LabRuns'
import { Profile } from './pages/Profile'

export default function App() {
    return (
        <Router>
            <Sidebar />
            <main className="main-content">
                <TopBar />
                <div className="content-area">
                    <Route path="/home">
                        <Home />
                    </Route>
                    <Route path="/my-prs">
                        <MyPrs />
                    </Route>
                    <Route path="/runs">
                        <Runs />
                    </Route>
                    <Route path="/reports">
                        <Reports />
                    </Route>
                    <Route path="/lab-test">
                        <LabTest />
                    </Route>
                    <Route path="/lab-runs">
                        <LabRuns />
                    </Route>
                    <Route path="/profile">
                        <Profile />
                    </Route>
                </div>
            </main>
        </Router>
    )
}
