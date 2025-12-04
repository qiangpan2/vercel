import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/machines/set-maintenance')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/api/machines/set-maintenance"!</div>
}
