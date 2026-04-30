import { cn } from "@/lib/utils";
import { Brain, Shield, Bitcoin, Atom, Link2, Linkedin } from "lucide-react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  id: string;
}

const navItems: NavItem[] = [
  { label: "AI & ROBOTICS", icon: <Brain className="w-5 h-5" />, id: "ai" },
  { label: "CYBERSECURITY", icon: <Shield className="w-5 h-5" />, id: "cybersecurity" },
  { label: "BITCOIN", icon: <Bitcoin className="w-5 h-5" />, id: "btc" },
  { label: "QUANTUM", icon: <Atom className="w-5 h-5" />, id: "quantum" },
  { label: "CONNECT", icon: <Link2 className="w-5 h-5" />, id: "connect" },
];


interface SidebarProps {
  activeSection: string;
  onSectionChange: (id: string) => void;
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  return (
    <aside className="flex flex-col gap-3">
      {navItems.map((item, index) => (
        <button
          key={item.id}
          onClick={() => onSectionChange(item.id)}
          className={cn(
            "group flex items-center gap-3 px-5 py-3 rounded-full border-2 transition-all duration-300",
            "text-sm font-medium tracking-wider",
            "opacity-0 animate-fade-in-left",
            activeSection === item.id
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border bg-card hover:border-primary/50 hover:bg-accent/50 text-foreground"
          )}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <span
            className={cn(
              "transition-colors duration-300",
              activeSection === item.id
                ? "text-primary"
                : "text-muted-foreground group-hover:text-primary"
            )}
          >
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
      
      {/* Social Icons */}
      <div className="flex gap-3 mt-2 ml-2 opacity-0 animate-fade-in-left" style={{ animationDelay: '500ms' }}>
        <a
          href="https://www.linkedin.com/company/sycureai/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full border-2 border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-all duration-300 text-muted-foreground hover:text-primary"
          aria-label="LinkedIn"
        >
          <Linkedin className="w-5 h-5" />
        </a>
      </div>
    </aside>
  );
}
