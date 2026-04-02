function parseBoolean(value: string | null | undefined): boolean | null {
	if (value == null) return null
	const normalized = value.trim().toLowerCase()
	if (["1", "true", "yes", "on"].includes(normalized)) return true
	if (["0", "false", "no", "off"].includes(normalized)) return false
	return null
}

function getChatWidgetEnvDefault(): boolean {
	const raw = import.meta.env["VITE_CHAT_WIDGET_ENABLED"] as string | undefined
	const parsed = parseBoolean(raw)
	return parsed ?? true
}

function getChatWidgetSearchOverride(): boolean | null {
	if (typeof window === "undefined") return null
	const params = new URLSearchParams(window.location.search)
	const raw = params.get("chatWidget") ?? params.get("chat") ?? params.get("chat_widget")
	return parseBoolean(raw)
}

export function isChatWidgetEnabled(): boolean {
	return getChatWidgetSearchOverride() ?? getChatWidgetEnvDefault()
}

