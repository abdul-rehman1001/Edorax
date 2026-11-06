import { AdminActionForm } from "@/components/admin/admin-action-form";
import { approveCourseAccessAction, markInstructorPayoutPaidAction } from "@/server/actions/admin/course-access";
import { serverApiFetch } from "@/lib/api-server";
import { requireRole } from "@/server/auth/guards";
import { formatPriceCents } from "@/lib/format-price";

type RequestRow = { id: string; user: { name: string | null; email: string } | null; course: { title: string }; payment: { amountCents: number; currency: string } | null };
type PayoutRow = { id: string; amountCents: number; instructorPayoutStatus: "PENDING" | "PAID"; instructorShareCents: number; currency: string; instructorPayoutPaidAt: string | null; learner: { name: string | null; email: string } | null; course: string; instructor: { name: string | null; email: string } };

export default async function CourseAccessPage() {
  await requireRole("ADMIN");
  const [requests, payouts] = await Promise.all([
    serverApiFetch<RequestRow[]>("/api/v1/admin/manual-access"),
    serverApiFetch<PayoutRow[]>("/api/v1/admin/manual-payouts"),
  ]);
  return <div className="space-y-6 p-6"><h1 className="text-2xl font-semibold">Course access</h1>
    <p>Contact learners and confirm payment before granting access. This list includes all enrollments awaiting payment, including learners who have not yet sent an email request.</p>
    {requests.length === 0 && <p>No enrollments are awaiting payment.</p>}
    {requests.map(row => <div key={row.id} className="rounded border p-4 space-y-2">
      <p className="font-medium">{row.course.title} — {row.payment ? formatPriceCents(row.payment.amountCents, row.payment.currency) : "Payment details unavailable"}</p>
      <p>{row.user?.name} {row.user?.email}</p>
      {row.payment && <AdminActionForm action={approveCourseAccessAction} submitLabel="Grant access" pendingLabel="Granting…" confirm={{ question: `Confirm payment for ${row.user?.email ?? "this learner"}?`, description: `Grant access to ${row.course.title} after verifying payment of ${formatPriceCents(row.payment.amountCents, row.payment.currency)}.`, confirmLabel: "Confirm payment and grant access" }}><input type="hidden" name="id" value={row.id} /></AdminActionForm>}
    </div>)}
    <section className="space-y-3 border-t pt-5"><h2 className="text-xl font-semibold">Instructor payouts</h2><p className="text-sm text-muted-foreground">Manual payments split 50/50. After transferring the instructor’s half outside Edorax, mark it paid here.</p>
      {payouts.length === 0 && <p>No instructor payouts are due.</p>}
      {payouts.map(row => <div key={row.id} className="rounded border p-4 space-y-2"><p className="font-medium">{row.course} — received {formatPriceCents(row.amountCents, row.currency)} · instructor share {formatPriceCents(row.instructorShareCents, row.currency)} to {row.instructor.name ?? row.instructor.email}</p><p className="text-sm">Learner: {row.learner?.name ?? row.learner?.email ?? "Unknown"} · {row.instructorPayoutStatus === "PAID" ? "Paid" : "Pending"}</p>
        {row.instructorPayoutStatus === "PENDING" && <AdminActionForm action={markInstructorPayoutPaidAction} submitLabel="Mark instructor paid" pendingLabel="Saving…" confirm={{ question: `Mark ${row.instructor.email}'s payout as paid?`, description: `Record the manual transfer of ${formatPriceCents(row.instructorShareCents, row.currency)} for ${row.course}.`, confirmLabel: "Confirm payout" }}><input type="hidden" name="id" value={row.id} /></AdminActionForm>}
      </div>)}
    </section>
  </div>;
}
