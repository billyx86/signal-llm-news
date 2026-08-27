import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

// The router instance is supplied by TanStack Start via the `#tanstack-router-entry`
// alias (resolved from src/router.tsx), so the handler only needs the stream
// callback here. See @tanstack/react-start-server default-entry.
export default createStartHandler(defaultStreamHandler)
