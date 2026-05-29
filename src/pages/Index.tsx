import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Sidebar } from "@/components/Sidebar";
import { TopicAccordion } from "@/components/TopicAccordion";
import { ContactForm } from "@/components/ContactForm";
import { useIntelligenceFeed } from "@/hooks/useIntelligenceFeed";

const topicMeta = [
  { title: "AI & ROBOTICS", subtitle: "AGENTIC SECURITY & AUTONOMOUS SYSTEMS", section: "ai" },
  { title: "CYBERSECURITY", subtitle: "CVEs, Exploits & Zero-Days", section: "cybersecurity" },
  { title: "BITCOIN", subtitle: "Crypto Hacks & Blockchain Vulnerabilities", section: "btc" },
  { title: "QUANTUM COMPUTING", subtitle: "Post-Quantum Cryptography & NIST PQC", section: "quantum" },
  { title: "FUNDING", subtitle: "Startup Rounds in AI, Security, Crypto & Quantum", section: "funding" },
];

function IntelligenceAccordion({ title, subtitle, section, index }: { title: string; subtitle: string; section: string; index: number }) {
  const { links, loading, isLive, refresh } = useIntelligenceFeed(section);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <TopicAccordion
      title={title}
      subtitle={subtitle}
      links={links}
      index={index}
      lastUpdated={links.length > 0 ? new Date().toISOString() : undefined}
      onRefresh={handleRefresh}
      isRefreshing={refreshing}
      isLive={isLive}
      isLoading={loading}
    />
  );
}

const Index = () => {
  const [activeSection, setActiveSection] = useState<string>("all");

  const showContactForm = activeSection === "connect";

  const filteredTopics =
    activeSection === "all"
      ? topicMeta
      : topicMeta.filter((t) => t.section === activeSection);

  const displayTopics = filteredTopics.length > 0 ? filteredTopics : topicMeta;

  const handleLogoClick = () => {
    setActiveSection("all");
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 md:py-12 max-w-6xl">
        <header className="mb-12 md:mb-16">
          <Logo onClick={handleLogoClick} />
        </header>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
          <nav className="lg:w-56 flex-shrink-0" aria-label="Topic navigation">
            <Sidebar
              activeSection={activeSection}
              onSectionChange={setActiveSection}
            />
          </nav>

          <section className="flex-1 space-y-6" aria-label="Topics">
            {showContactForm ? (
              <ContactForm />
            ) : (
              displayTopics.map((topic, index) => (
                <IntelligenceAccordion
                  key={topic.section}
                  title={topic.title}
                  subtitle={topic.subtitle}
                  section={topic.section}
                  index={index}
                />
              ))
            )}
          </section>
        </div>

        <footer className="mt-16 md:mt-24 pt-8 border-t border-border">
          <p className="text-sm text-muted-foreground font-light tracking-wide">
            © {new Date().getFullYear()} Sycure.ai — Exploring the intersection of AI, security, and emerging tech.
          </p>
        </footer>
      </div>
    </main>
  );
};

export default Index;
