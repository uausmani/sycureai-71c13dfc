import { cn } from "@/lib/utils";
import { Linkedin } from "lucide-react";

interface NavItem {
  label: string;
  id: string;
}

const navItems: NavItem[] = [
  { label: "ALL TOPICS", id: "all" },
  { label: "AI & ROBOTICS", id: "ai" },
  { label: "CYBERSECURITY", id: "cybersecurity" },
  { label: "BITCOIN", id: "btc" },
  { label: "QUANTUM COMPUTING", id: "quantum" },
  { label: "FUNDING", id: "funding" },
  { label: "CONNECT", id: "connect" },
];


interface SidebarProps {
  activeSection: string;
  onSectionChange: (id: string) => void;
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  return (
    <aside className="flex flex-col space-y-1 w-48">
      <p className="text-xs font-semibold text-muted-foreground/70 tracking-widest mb-3 px-3">
        TOPICS
      </p>
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onSectionChange(item.id)}
          className={cn(
            "text-left w-full block px-4 py-2.5 rounded-full uppercase tracking-wider text-xs transition-colors",
            activeSection === item.id
              ? "bg-accent text-primary font-bold"
              : "bg-transparent text-foreground/70 hover:text-foreground hover:bg-muted/60 font-semibold"
          )}
        >
          {item.label}
        </button>
      ))}

      
      {/* Social Icons */}
      <div className="flex gap-3 mt-2 ml-2 opacity-0 animate-fade-in-left" style={{ animationDelay: '500ms' }}>
        <a
          href="https://www.linkedin.com/company/sycureai"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full border-2 border-border bg-card transition-all duration-300 text-muted-foreground hover:border-primary/50 hover:text-primary"
          aria-label="LinkedIn"
        >
          <Linkedin className="w-5 h-5" />
        </a>
      </div>
    </aside>
  );
}
