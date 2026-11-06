"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCourseCoupon, setCourseCouponActive, type CourseCouponRow } from "@/server/actions/course-coupons";

export function CourseCouponsPanel({ courseId, courseSlug, coupons }: { courseId: string; courseSlug: string; coupons: CourseCouponRow[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [percentOff, setPercentOff] = useState("100");
  const [maxRedemptions, setMaxRedemptions] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  return <section id="course-coupons" className="scroll-mt-24 space-y-5 rounded-xl border bg-card p-5" aria-labelledby="course-coupons-heading">
    <div>
      <h2 id="course-coupons-heading" className="text-lg font-semibold">Course discount coupons</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Create a code to share with interested learners. A 100% coupon grants immediate access; a partial discount reduces the amount the learner requests access for. Each code has a redemption limit.</p>
    </div>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      const result = await createCourseCoupon({ courseId, courseSlug, code, label, percentOff: Number(percentOff), maxRedemptions: Number(maxRedemptions), expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null });
      setBusy(false);
      if (!result.ok) { setMessage(result.errors.join(" ")); return; }
      setCode(""); setLabel(""); setExpiresAt(""); setMessage("Coupon created. Share the code with the learner."); router.refresh();
    }}>
      <Input required minLength={3} maxLength={32} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="WELCOME100" aria-label="Coupon code" />
      <Input required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label (for example, Early learner)" aria-label="Coupon label" />
      <label className="space-y-1 text-xs text-muted-foreground">Discount percentage<Input required type="number" min={1} max={100} step={1} value={percentOff} onChange={(event) => setPercentOff(event.target.value)} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Redemption limit<Input required type="number" min={1} max={10000} value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Expires on (optional)<Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Ticket />} Create coupon</Button></div>
    </form>
    {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    <div className="divide-y rounded-lg border">
      {coupons.length ? coupons.map((coupon) => <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
        <div className="min-w-0"><p className="font-semibold">{coupon.code} <span className="font-normal text-muted-foreground">· {coupon.percentOff}% off · {coupon.label}</span></p><p className="text-xs text-muted-foreground">{coupon.redemptionCount}/{coupon.maxRedemptions} used · {coupon.remaining} left{coupon.expiresAt ? ` · expires ${new Date(coupon.expiresAt).toLocaleDateString()}` : ""} · {coupon.active ? "Active" : "Paused"}</p></div>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(coupon.code); setMessage("Coupon code copied."); }}><Copy /> Copy</Button><Button size="sm" variant="ghost" onClick={async () => { const result = await setCourseCouponActive({ courseId, courseSlug, couponId: coupon.id, active: !coupon.active }); setMessage(result.ok ? `Coupon ${coupon.active ? "paused" : "activated"}.` : result.errors.join(" ")); if (result.ok) router.refresh(); }}>{coupon.active ? "Pause" : "Activate"}</Button></div>
      </div>) : <p className="p-3 text-sm text-muted-foreground">No coupons yet.</p>}
    </div>
  </section>;
}
