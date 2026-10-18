import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileBrands, Sidebar } from "@/components/chat/sidebar";
import { Logo } from "@/components/chat/logo";
import { IS_SHOWCASE } from "@/lib/showcase";
import { REPO_URL } from "@/lib/brand";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {IS_SHOWCASE && (
          <p className="bg-primary/10 px-4 py-2 text-center text-[13px] text-foreground/85">
            Read-only replay of real runs. Nothing here calls Manus or fal.{" "}
            <a href={REPO_URL} className="text-primary underline underline-offset-4">Clone the repo</a> to run it with your own keys.
          </p>
        )}
        {/* Mobile top bar; the sidebar is desktop-only. */}
        <header className="flex items-center justify-between bg-sidebar px-4 py-3 md:hidden">
          <Link href="/"><Logo /></Link>
          <Button asChild size="sm">
            <Link href="/"><Plus /> New brand</Link>
          </Button>
        </header>
        <MobileBrands />
        {children}
      </div>
    </div>
  );
}
