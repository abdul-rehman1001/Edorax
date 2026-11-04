import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ create: vi.fn(), find: vi.fn(), remove: vi.fn(), user: vi.fn(), session: vi.fn(), transaction: vi.fn() }));
vi.mock("../../../../src/db/prisma.js", () => ({ prisma: { verificationToken: { create: mocks.create, deleteMany: mocks.remove }, $transaction: mocks.transaction } }));
import { authorizeDesktop, desktopChallenge, exchangeDesktop } from "../../../../src/services/auth/desktop.js";
const verifier = "v".repeat(43);
const validRow = () => ({ identifier: `desktop-code:${desktopChallenge(verifier)}:user-one`, token: "hash", expires: new Date(Date.now() + 60_000) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(callback => callback({ verificationToken: { findUnique: mocks.find, deleteMany: mocks.remove }, user: { findUnique: mocks.user }, session: { create: mocks.session } }));
  mocks.find.mockResolvedValue(validRow());
  mocks.remove.mockResolvedValue({ count: 1 });
  mocks.user.mockResolvedValue({ id: "user-one", role: "MENTEE", emailVerified: new Date() });
  mocks.session.mockImplementation(({ data }) => Promise.resolve(data));
});
describe("desktop browser sign-in", () => {
  it("stores a hashed, short-lived code bound to the desktop challenge", async () => {
    const { code } = await authorizeDesktop("user-one", desktopChallenge(verifier));
    const data = mocks.create.mock.calls[0][0].data;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.token).toBe(createHash("sha256").update(code).digest("hex"));
    expect(data.identifier).toBe(validRow().identifier);
    expect(data.expires.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
  });
  it("exchanges the correct proof for a separate desktop session", async () => {
    const result = await exchangeDesktop("code", verifier);
    expect(result.session.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.user).toEqual({ id: "user-one" });
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.session.mock.calls[0][0].data.userId).toBe("user-one");
  });
  it.each([null, { ...validRow(), expires: new Date(0) }, { ...validRow(), identifier: "magic-link:user@example.com" }])("rejects absent, expired, or wrong-purpose codes", async row => {
    mocks.find.mockResolvedValue(row);
    await expect(exchangeDesktop("code", verifier)).rejects.toThrow(/expired or is invalid/);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("rejects a different verifier without consuming the valid code", async () => {
    await expect(exchangeDesktop("code", "wrong")).rejects.toThrow();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("rejects replay when a competing exchange already consumed the code", async () => {
    mocks.remove.mockResolvedValue({ count: 0 });
    await expect(exchangeDesktop("code", verifier)).rejects.toThrow(/already been used/);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not mint sessions for accounts that are no longer verified", async () => {
    mocks.user.mockResolvedValue({ id: "user-one", role: "MENTEE", emailVerified: null });
    await expect(exchangeDesktop("code", verifier)).rejects.toThrow(/Verify your email/);
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
