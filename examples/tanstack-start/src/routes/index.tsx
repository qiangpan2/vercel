import { createFileRoute, redirect } from '@tanstack/react-router'

// 将根路径重定向到CI页面
export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/ci' })
  },
})