import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { EdoraxLanding } from "@/components/marketing/edorax/edorax-landing";
import { getSessionUser } from "@/server/auth/guards";
import { homeRouteForRole } from "@/server/auth/access-rules";

export const metadata: Metadata = {
  title: { absolute: "Edorax: every lesson starts with a question" },
  description: "Short lessons you can read, play with, listen to and prove. Built for phones, slow connections and second-language learners.",
  alternates: { canonical: "/" },
  openGraph: { title: "Edorax: every lesson starts with a question", url: "/", images: [SITE_SHARE_IMAGE] },
};

export default async function HomePage() {
  const user = await getSessionUser();
  const dashboardHref = user ? homeRouteForRole(user.role) : null;
  return <EdoraxLanding dashboardHref={dashboardHref} />;
}
