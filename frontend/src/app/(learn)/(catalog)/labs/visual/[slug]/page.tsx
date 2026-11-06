import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Lab } from "@buildment/learning-ui/labs/Lab";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { isLabSlug } from "@/shared/lab/slugs";
import { visualLabSummary } from "@/lib/visual-labs";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const lab = isLabSlug(slug) ? visualLabSummary(slug) : null;
  if (!lab) return { title: "Lab not found" };
  return {
    title: lab.title,
    description: lab.purpose,
    alternates: { canonical: `/labs/visual/${slug}` },
    openGraph: { title: `${lab.title} | Edorax labs`, url: `/labs/visual/${slug}`, images: [SITE_SHARE_IMAGE] },
  };
}

/** One visual lab on its own page, the same board a course chapter embeds. */
export default async function VisualLabPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!isLabSlug(slug)) notFound();
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/labs/visual"
        className="inline-flex min-h-11 items-center gap-2 text-base font-bold text-primary outline-none underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All visual labs
      </Link>
      <Lab key={slug} slug={slug} />
    </div>
  );
}
