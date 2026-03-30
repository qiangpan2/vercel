import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/ci')({
  loader: () => {
    throw redirect({ to: '/booking' })
  },
})
