/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest"

import { isChatWidgetEnabled } from "./chat-widget"

const ENV_KEY = "VITE_CHAT_WIDGET_ENABLED"
const originalEnvValue = (import.meta.env as Record<string, unknown>)[ENV_KEY]

function setViteEnv(value: string | undefined) {
	const env = import.meta.env as Record<string, unknown>
	if (value === undefined) {
		delete env[ENV_KEY]
	} else {
		env[ENV_KEY] = value
	}
}

function setSearch(search: string) {
	window.history.replaceState({}, "", search)
}

afterEach(() => {
	setViteEnv(originalEnvValue as string | undefined)
	setSearch("")
})

describe("isChatWidgetEnabled", () => {
	it("defaults to enabled", () => {
		setViteEnv(undefined)
		setSearch("")
		expect(isChatWidgetEnabled()).toBe(true)
	})

	it("can be disabled via env", () => {
		setViteEnv("false")
		setSearch("")
		expect(isChatWidgetEnabled()).toBe(false)
	})

	it("url param overrides env", () => {
		setViteEnv("false")
		setSearch("?chatWidget=1")
		expect(isChatWidgetEnabled()).toBe(true)
	})
})

