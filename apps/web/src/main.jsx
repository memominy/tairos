import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queryClient'
import './index.css'

// QueryClientProvider wraps the whole tree so any component can
// useQuery/useMutation without prop-drilling a client. The client
// itself is a module-level singleton (see lib/queryClient.js) —
// reassigning it here would defeat React Query's caching.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
