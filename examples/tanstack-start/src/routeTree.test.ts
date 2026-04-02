import fs from "node:fs"

import { describe, expect, it } from "vitest"

describe("route tree", () => {
	it("does not include the buggy events.$id catch-all route", () => {
		expect(fs.existsSync("src/routes/api/calendar/events.$id.ts")).toBe(false)

		const source = fs.readFileSync("src/routeTree.gen.ts", "utf8")

		expect(source).toContain("path: '/api/calendar/events'")
		expect(source).not.toContain("events.$id")
		expect(source).not.toContain("path: '/$")
		expect(source).not.toContain('path: "/$')
	})
})

