import { lazy, Suspense } from "react"

import { getCurrentUser } from "../utils/auth"
import { isChatWidgetEnabled } from "../utils/chat-widget"

const LazyChatWidget = lazy(() => import("./ChatWidget"))

export default function ChatWidgetLoader({ enabled }: { enabled?: boolean }) {
	if (typeof window === "undefined") return null

	const effectiveEnabled = enabled ?? isChatWidgetEnabled()
	if (!effectiveEnabled) return null

	const user = getCurrentUser()
	if (!user) return null

	return (
		<Suspense fallback={null}>
			<LazyChatWidget />
		</Suspense>
	)
}

