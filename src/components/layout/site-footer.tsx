import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">
                  K
                </span>
              </div>
              <span className="font-semibold">{siteConfig.name}</span>
            </div>
            <p className="text-muted-foreground text-sm">
              {siteConfig.description}
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Product</h4>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <Link href="#features" className="hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="hover:text-foreground">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-foreground">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Company</h4>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <Link href="#" className="hover:text-foreground">
                  About
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Careers
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Legal</h4>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>
                <Link href="#" className="hover:text-foreground">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-foreground">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="text-muted-foreground mt-8 border-t pt-8 text-center text-sm">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
