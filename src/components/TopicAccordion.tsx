import { cn } from "@/lib/utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import type { NewsLink } from "@/data/newsData";

interface TopicAccordionProps {
  title: string;
  subtitle: string;
  links: NewsLink[];
  index: number;
  lastUpdated?: string;
  isLive?: boolean;
  isLoading?: boolean;
  isSyncing?: boolean;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TopicAccordion({
  title,
  subtitle,
  links,
  index,
  lastUpdated,
  isLive,
  isLoading,
  isSyncing,
}: TopicAccordionProps) {
  return (
    <div
      className={cn("opacity-0 animate-fade-in")}
      style={{ animationDelay: `${200 + index * 150}ms` }}
    >
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value={title}
          className="border-2 border-border rounded-2xl bg-card overflow-hidden hover:border-primary/40 transition-all duration-300"
        >
          <AccordionTrigger className="px-8 py-6 hover:no-underline group">
            <div className="flex items-center gap-3 w-full">
              <div className="flex flex-col items-start text-left flex-1">
                <h3 className="text-xl font-medium tracking-wide text-foreground group-hover:text-primary transition-colors duration-300">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground font-light tracking-wide uppercase mt-1">
                  {subtitle}
                </p>
              </div>
              {isLive && (
                <span className="flex items-center gap-2 text-xs font-medium text-primary uppercase tracking-wider shrink-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  Live
                  {isSyncing && (
                    <RefreshCw
                      className="h-3 w-3 animate-spin text-muted-foreground"
                      aria-label="Syncing"
                    />
                  )}
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-8 pb-6">
            {isLoading ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground tracking-wide uppercase animate-pulse">
                  Scanning for threats...
                </p>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="h-4 w-4 mt-0.5 shrink-0 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <ul className="space-y-1">
                  {links.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/link flex items-start gap-3 px-3 py-3 -mx-3 rounded-lg transition-all duration-200 hover:bg-accent/50 hover:border-l-2 hover:border-primary hover:pl-4"
                      >
                        <ExternalLink className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground group-hover/link:text-primary transition-colors duration-200" />
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-sm tracking-wide text-foreground group-hover/link:text-primary transition-colors duration-200 leading-snug">
                            {link.title}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-light tracking-wide">
                              {link.sourceName}
                              {link.timestamp && (
                                <> · {timeAgo(link.timestamp)}</>
                              )}
                            </span>
                            {link.via && (
                              <span className={cn(
                                "text-[10px] font-medium tracking-wider uppercase px-1.5 py-0.5 rounded",
                                link.via === 'Tree News'
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                via {link.via}
                              </span>
                            )}
                          </div>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>

                {lastUpdated && (
                  <div className="flex items-center justify-start mt-4 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground font-light tracking-wide">
                      Updated {timeAgo(lastUpdated)}
                    </span>
                  </div>
                )}
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
