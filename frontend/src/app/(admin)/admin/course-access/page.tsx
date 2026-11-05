import { revalidatePath } from "next/cache";
import { serverApiFetch } from "@/lib/api-server";
import { requireRole } from "@/server/auth/guards";
import { formatPriceCents } from "@/lib/format-price";

type RequestRow = { id: string; user: { name: string | null; email: string } | null; course: { title: string }; payment: { amountCents: number; currency: string } | null };

async function approve(formData: FormData) {
  "use server";
  await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await serverApiFetch(`/api/v1/admin/manual-access/${encodeURIComponent(id)}/approve`, { method: "POST" });
  revalidatePath("/admin/course-access");
}

export default async function CourseAccessPage() {
  await requireRole("ADMIN");
  const requests = await serverApiFetch<RequestRow[]>("/api/v1/admin/manual-access");
  return <div className="space-y-6 p-6"><h1 className="text-2xl font-semibold">Course access</h1>
    <p>Contact learners and confirm payment before granting access. This list includes all enrollments awaiting payment, including learners who have not yet sent an email request.</p>
    {requests.length === 0 && <p>No enrollments are awaiting payment.</p>}
    {requests.map(row => <div key={row.id} className="rounded border p-4 space-y-2">
      <p className="font-medium">{row.course.title} — {row.payment ? formatPriceCents(row.payment.amountCents, row.payment.currency) : "Payment details unavailable"}</p>
      <p>{row.user?.name} {row.user?.email}</p>
      {row.payment && <form action={approve}><input type="hidden" name="id" value={row.id} /><button className="rounded bg-primary px-4 py-2 text-primary-foreground" type="submit">Confirm payment and grant access</button></form>}
    </div>)}
  </div>;
}
