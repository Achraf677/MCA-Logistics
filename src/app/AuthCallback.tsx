import { Navigate } from 'react-router-dom'

// Supabase's detectSessionInUrl:true + getSession() blocking on _initializePromise
// ensures the code exchange is complete before AppRoutes even renders.
// This component only ever mounts when the user is already authenticated.
export function AuthCallback() {
  return <Navigate to="/" replace />
}
