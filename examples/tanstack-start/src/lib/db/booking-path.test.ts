import path from "node:path"

import { describe, expect, it } from "vitest"

import { resolveBookingDbPath } from "./booking"

describe("resolveBookingDbPath", () => {
	it("defaults to /mnt/data/vercel/booking.db", () => {
		expect(resolveBookingDbPath({ env: {} })).toBe("/mnt/data/vercel/booking.db")
	})

	it("uses the /mnt default on Vercel", () => {
		expect(resolveBookingDbPath({ env: { VERCEL: "1" } })).toBe("/mnt/data/vercel/booking.db")
	})

	it("respects BOOKING_DB_PATH override", () => {
		expect(resolveBookingDbPath({ env: { BOOKING_DB_PATH: "/custom/db.sqlite" } })).toBe(
			"/custom/db.sqlite",
		)
	})

	it("respects BOOKING_DB_DIR override", () => {
		expect(resolveBookingDbPath({ env: { BOOKING_DB_DIR: "/var/lib/myapp" } })).toBe(
			path.join("/var/lib/myapp", "booking.db"),
		)
	})

	it("uses repo db during tests", () => {
		const cwd = "/repo"
		expect(resolveBookingDbPath({ env: { VITEST: "1" }, cwd })).toBe(path.join(cwd, "data", "booking.db"))
	})
})
