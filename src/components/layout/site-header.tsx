import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">K</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="#features"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Features
          </Link>
          <Link
            href="#pricing"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button size="sm" render={<Link href="/signup" />}>
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}
