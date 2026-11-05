import { AdminActionForm } from "@/components/admin/admin-action-form";
import { approveCourseAccessAction } from "@/server/actions/admin/course-access";
import { serverApiFetch } from "@/lib/api-server";
import { requireRole } from "@/server/auth/guards";
import { formatPriceCents } from "@/lib/format-price";

type RequestRow = { id: string; user: { name: string | null; email: string } | null; course: { title: string }; payment: { amountCents: number; currency: string } | null };

export default async function CourseAccessPage() {
  await requireRole("ADMIN");
  const requests = await serverApiFetch<RequestRow[]>("/api/v1/admin/manual-access");
  return <div className="space-y-6 p-6"><h1 className="text-2xl font-semibold">Course access</h1>
    <p>Contact learners and confirm payment before granting access. This list includes all enrollments awaiting payment, including learners who have not yet sent an email request.</p>
    {requests.length === 0 && <p>No enrollments are awaiting payment.</p>}
    {requests.map(row => <div key={row.id} className="rounded border p-4 space-y-2">
      <p className="font-medium">{row.course.title} — {row.payment ? formatPriceCents(row.payment.amountCents, row.payment.currency) : "Payment details unavailable"}</p>
      <p>{row.user?.name} {row.user?.email}</p>
      {row.payment && <AdminActionForm action={approveCourseAccessAction} submitLabel="Grant access" pendingLabel="Granting…" confirm={{ question: `Confirm payment for ${row.user?.email ?? "this learner"}?`, description: `Grant access to ${row.course.title} after verifying payment of ${formatPriceCents(row.payment.amountCents, row.payment.currency)}.`, confirmLabel: "Confirm payment and grant access" }}><input type="hidden" name="id" value={row.id} /></AdminActionForm>}
    </div>)}
  </div>;
}
