import { Navigate } from 'react-router-dom'

export function AuthCallback() {
  return <Navigate to="/" replace />
}
