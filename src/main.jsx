import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './components/common/AuthProvider.jsx'
import { UserScopedAppState } from './components/common/UserScopedAppState.jsx'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UserScopedAppState>
          <App />
        </UserScopedAppState>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
