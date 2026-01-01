import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthUIProvider } from '@daveyplate/better-auth-ui'
import { authClient } from './lib/auth-client'
import { NuqsAdapter } from 'nuqs/adapters/react-router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NuqsAdapter>
      <AuthUIProvider authClient={authClient} apiKey={true}>
        <App />
      </AuthUIProvider>
    </NuqsAdapter>
  </StrictMode>,
)
