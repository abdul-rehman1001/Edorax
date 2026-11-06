"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminCourseCoupon, setAdminCourseCouponActive } from "@/server/actions/admin/course-coupons";

export type AdminCourseCoupon = {
  id: string; code: string | null; label: string; percentOff: number; autoApply: boolean;
  maxRedemptions: number; redemptionCount: number; remaining: number; active: boolean;
  expiresAt: string | null; createdAt: string;
};

export function AdminCourseCouponsPanel({ courseId, coupons }: { courseId: string; coupons: AdminCourseCoupon[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [percentOff, setPercentOff] = useState("10");
  const [maxRedemptions, setMaxRedemptions] = useState("100");
  const [expiresAt, setExpiresAt] = useState("");
  const [autoApply, setAutoApply] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return <div className="mt-8 space-y-6">
    <form className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      const result = await createAdminCourseCoupon({ courseId, code: code || null, label, percentOff: Number(percentOff), maxRedemptions: Number(maxRedemptions), expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null, autoApply });
      setBusy(false); setMessage(result.message);
      if (result.ok) { setCode(""); setLabel(""); setExpiresAt(""); router.refresh(); }
    }}>
      <Input minLength={3} maxLength={32} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder={autoApply ? "Optional coupon code" : "Coupon code"} aria-label="Coupon code" />
      <Input required maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Discount label" aria-label="Discount label" />
      <label className="space-y-1 text-xs text-muted-foreground">Discount percentage<Input required type="number" min={1} max={100} value={percentOff} onChange={(event) => setPercentOff(event.target.value)} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Redemption limit<Input required type="number" min={1} max={10000} value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} /></label>
      <label className="space-y-1 text-xs text-muted-foreground">Expires on (optional)<Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoApply} onChange={(event) => setAutoApply(event.target.checked)} /> Automatically apply at checkout</label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy}><Ticket /> {busy ? "Saving…" : "Create discount"}</Button>{message ? <span role="status" className="text-sm text-muted-foreground">{message}</span> : null}</div>
    </form>
    <div className="divide-y rounded-xl border bg-card">
      {coupons.length ? coupons.map((coupon) => <div key={coupon.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div><p className="font-semibold">{coupon.code ?? "Automatic discount"} <span className="font-normal text-muted-foreground">· {coupon.percentOff}% off · {coupon.label}{coupon.autoApply ? " · Auto-applied" : ""}</span></p><p className="mt-1 text-xs text-muted-foreground">{coupon.redemptionCount}/{coupon.maxRedemptions} redeemed · {coupon.remaining} left{coupon.expiresAt ? ` · expires ${new Date(coupon.expiresAt).toLocaleDateString()}` : ""} · {coupon.active ? "Active" : "Paused"}</p></div>
        <div className="flex gap-2">{coupon.code ? <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(coupon.code!); setMessage("Coupon code copied."); }}><Copy /> Copy</Button> : null}<Button size="sm" variant="ghost" onClick={async () => { const result = await setAdminCourseCouponActive({ courseId, couponId: coupon.id, active: !coupon.active }); setMessage(result.message); if (result.ok) router.refresh(); }}>{coupon.active ? "Pause" : "Activate"}</Button></div>
      </div>) : <p className="p-4 text-sm text-muted-foreground">No coupons or discounts yet.</p>}
    </div>
  </div>;
}
