import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ enrollment: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }, user: { findMany: vi.fn() }, payment: { update: vi.fn() }, adminAuditLog: { create: vi.fn() }, $transaction: vi.fn() }));
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/config/env.js", () => ({ env: { ADMIN_NOTIFY_EMAIL: ["ops@example.com"] } }));
vi.mock("../../../../src/services/email/send.js", () => ({ appBaseUrl: () => "https://example.com", sendEmail }));
import { approveManualAccess, requestManualAccess } from "../../../../src/services/enrollment/manual-access.js";

describe("manual course access", () => {
  beforeEach(() => { vi.clearAllMocks(); db.$transaction.mockImplementation(async fn => fn(db)); });
  it("sends the learner and course details to administrators without activating access", async () => {
    db.enrollment.findFirst.mockResolvedValue({ lifecycle: "PAYMENT_REQUIRED", user: { name: "Learner", email: "learner@example.com" }, course: { title: "Course", priceCents: 1000, currency: "USD" }, payment: { amountCents: 1000, currency: "USD" } });
    db.user.findMany.mockResolvedValue([{ email: "admin@example.com" }]);
    sendEmail.mockResolvedValue({ sent: true });
    await requestManualAccess("enrollment", "user");
    expect(db.enrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "enrollment", userId: "user" } }));
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0].text).toContain("learner@example.com");
    expect(db.enrollment.updateMany).not.toHaveBeenCalled();
  });
  it("keeps the access request recorded when delivery fails", async () => {
    db.enrollment.findFirst.mockResolvedValue({ lifecycle: "PAYMENT_REQUIRED", user: { email: "learner@example.com" }, course: { title: "Course", priceCents: 1000, currency: "USD" }, payment: null });
    db.user.findMany.mockResolvedValue([]); sendEmail.mockResolvedValue({ sent: false });
    await expect(requestManualAccess("enrollment", "user")).resolves.toEqual({ requested: true, emailSent: false });
  });
  it("accepts a successful delivery even if another administrator's email fails", async () => {
    db.enrollment.findFirst.mockResolvedValue({ lifecycle: "PAYMENT_REQUIRED", user: { email: "learner@example.com" }, course: { title: "Course", priceCents: 1000, currency: "USD" }, payment: null });
    db.user.findMany.mockResolvedValue([{ email: "admin@example.com" }]);
    sendEmail.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce({ sent: true });
    await expect(requestManualAccess("enrollment", "user")).resolves.toEqual({ requested: true, emailSent: true });
  });
  it("activates only a pending enrollment and records the manual payment in one transaction", async () => {
    db.enrollment.findUnique.mockResolvedValue({ lifecycle: "PAYMENT_REQUIRED", payment: {}, startedAt: null });
    db.enrollment.updateMany.mockResolvedValue({ count: 1 });
    await approveManualAccess("enrollment", { id: "admin", email: "admin@example.com" });
    expect(db.enrollment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "enrollment", lifecycle: "PAYMENT_REQUIRED" } }));
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", provider: "manual" }) }));
    db.enrollment.findUnique.mockResolvedValue({ lifecycle: "ACTIVE", payment: {} });
    await expect(approveManualAccess("enrollment", { id: "admin", email: "admin@example.com" })).rejects.toThrow();
  });
});
