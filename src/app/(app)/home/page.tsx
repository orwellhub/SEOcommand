import Link from "next/link";
import { ArrowRight, Building2, LayoutDashboard, ListChecks, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/primitives";

const STARTS = [
  { href: "/research", title: "Research a market", description: "Explore demand, competitors and opportunities without choosing a website.", icon: Search, color: "#335CFF" },
  { href: "/portfolio", title: "Review the portfolio", description: "See performance, risks and opportunities across every managed website.", icon: LayoutDashboard, color: "#12B8C4" },
  { href: "/action-centre", title: "Continue execution", description: "Open assigned recommendations, approvals and work already in progress.", icon: ListChecks, color: "#FF6B5E" },
  { href: "/sites", title: "Open a website", description: "Enter one website's rankings, technical, content, link and reporting workspace.", icon: Building2, color: "#7137F5" },
] as const;

export default function HomePage() {
  return (
    <div className="animate-in space-y-5">
      <PageHeader title="SEO Command Centre" description="Start with independent research, portfolio intelligence or the next approved action." />
      <Card className="relative overflow-hidden border-0 bg-ink p-6 text-white sm:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(51,92,255,0.24),transparent_68%)]" />
        <div className="relative max-w-3xl"><div className="text-2xs font-bold uppercase tracking-[0.16em] text-white/50">Research to execution</div><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Find the opportunity. Connect the evidence. Ship the work. Measure the result.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">Global research stays independent until you explicitly map an opportunity to a website.</p></div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {STARTS.map(({ href, title, description, icon: Icon, color }) => <Link key={href} href={href} className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop"><span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} /><div className="flex items-start gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ color, background: `${color}14` }}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-base font-extrabold text-ink">{title}</span><span className="mt-1 block text-xs leading-5 text-muted">{description}</span></span><ArrowRight className="mt-1 h-4 w-4 text-muted transition-transform group-hover:translate-x-1" /></div></Link>)}
      </div>
    </div>
  );
}
