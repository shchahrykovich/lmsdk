import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import Home from './pages/Home'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Prompts from './pages/Prompts'
import PromptDetail from './pages/PromptDetail'
import ApiKeys from './pages/ApiKeys'
import Logs from './pages/Logs'
import LogDetail from './pages/LogDetail'
import Traces from './pages/Traces'
import TraceDetail from './pages/TraceDetail'
import Users from './pages/Users'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import { useSession } from './lib/auth-client'
import './App.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/signin" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:slug" element={<ProjectDetail />} />
          <Route path="/projects/:slug/prompts" element={<Prompts />} />
          <Route path="/projects/:slug/prompts/:promptSlug" element={<PromptDetail />} />
          <Route path="/projects/:slug/logs" element={<Logs />} />
          <Route path="/projects/:slug/logs/:logId" element={<LogDetail />} />
          <Route path="/projects/:slug/traces" element={<Traces />} />
          <Route path="/projects/:slug/traces/:traceId" element={<TraceDetail />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/users" element={<Users />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
