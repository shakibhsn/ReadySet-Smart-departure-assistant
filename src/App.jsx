import AppRoutes from '@/routes'
import { ThemeProvider } from '@/components/common/ThemeProvider'

export default function App() {
  return (
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  )
}
