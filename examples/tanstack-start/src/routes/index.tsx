import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { getCurrentUser, type User } from "../utils/auth"

export const Route = createFileRoute("/")({
	component: HomePage,
})

function HomePage() {
	const [user, setUser] = useState<User | null>(null)

	useEffect(() => {
		setUser(getCurrentUser())
	}, [])

	return (
		<div className="min-h-screen bg-gray-900 text-white">
			<div className="mx-auto max-w-4xl px-6 py-16">
				<h1 className="text-4xl font-black tracking-tight">Rapids</h1>
				<p className="mt-3 text-gray-300">
					AI Ops console for bookings, fleet inventory, and automation.
				</p>

				<div className="mt-10 rounded-xl border border-gray-800 bg-gray-950 p-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-sm text-gray-400">Status</p>
							<p className="mt-1 text-base">
								{user ? (
									<>
										Signed in as{" "}
										<span className="font-semibold">{user.displayName}</span>
									</>
								) : (
									<>Not signed in</>
								)}
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							{user ? (
								<Link
									to="/booking"
									className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold hover:bg-cyan-500 transition-colors"
								>
									Go to Booking
								</Link>
							) : (
								<Link
									to="/login"
									search={{ redirect: "/booking" }}
									className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold hover:bg-cyan-500 transition-colors"
								>
									Login
								</Link>
							)}
							<Link
								to="/machines"
								className="rounded-lg border border-gray-700 px-4 py-2 font-semibold hover:bg-gray-800 transition-colors"
							>
								Machines
							</Link>
							<Link
								to="/help"
								className="rounded-lg border border-gray-700 px-4 py-2 font-semibold hover:bg-gray-800 transition-colors"
							>
								Help
							</Link>
						</div>
					</div>

					<div className="mt-6 grid gap-3 sm:grid-cols-2">
						<div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
							<p className="text-sm font-semibold">Booking</p>
							<p className="mt-1 text-sm text-gray-400">
								Reserve machines and manage upcoming bookings.
							</p>
						</div>
						<div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
							<p className="text-sm font-semibold">Inventory</p>
							<p className="mt-1 text-sm text-gray-400">
								View fleet status, specs, and admin controls.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
// 将根路径重定向到Dashboard（CI页面）
export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/ci' })
  },
})
