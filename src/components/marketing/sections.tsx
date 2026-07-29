import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  Layers,
  Shield,
  Zap,
} from "lucide-react";

import { siteConfig, features } from "@/config/site";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const iconMap = {
  Layers,
  Zap,
  GitBranch,
  Shield,
} as const;

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-6">
            Now in public beta
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            The operating system for{" "}
            <span className="text-primary">modern teams</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg">
            {siteConfig.description}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" render={<Link href="/signup" />}>
              Start for free
              <ArrowRight className="ml-2 size-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={<Link href="/login" />}
            >
              Sign in
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Everything you need to run your team
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            A unified platform that replaces scattered tools with one powerful
            workspace.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = iconMap[feature.icon as keyof typeof iconMap];
            return (
              <Card key={feature.title} className="border-border/50">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Start free. Scale when you&apos;re ready.
          </p>
        </div>
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Starter</CardTitle>
              <CardDescription>For individuals and small teams</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-muted-foreground space-y-2 text-sm">
                <li>✓ Up to 3 projects</li>
                <li>✓ Unlimited tasks</li>
                <li>✓ 1 workspace</li>
                <li>✓ Basic analytics</li>
              </ul>
              <Button className="w-full" render={<Link href="/signup" />}>
                Get started
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary">
            <CardHeader>
              <Badge className="w-fit">Popular</Badge>
              <CardTitle className="mt-2">Pro</CardTitle>
              <CardDescription>For growing teams</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$12</span>
                <span className="text-muted-foreground">/user/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-muted-foreground space-y-2 text-sm">
                <li>✓ Unlimited projects</li>
                <li>✓ Advanced workflows</li>
                <li>✓ Multiple workspaces</li>
                <li>✓ Priority support</li>
              </ul>
              <Button className="w-full" render={<Link href="/signup" />}>
                Start free trial
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ready to transform how your team works?
          </h2>
          <p className="mt-4 text-lg opacity-90">
            Join teams already using KurvzOS to ship faster and stay aligned.
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-8"
            render={<Link href="/signup" />}
          >
            Get started for free
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
