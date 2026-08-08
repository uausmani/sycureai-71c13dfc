interface LogoProps {
  onClick?: () => void;
}

export function Logo({ onClick }: LogoProps) {
  return (
    <div className="flex items-center opacity-0 animate-fade-in">
      <button 
        onClick={onClick}
        className="focus:outline-none transition-transform duration-200 hover:scale-105"
        aria-label="Go to home"
      >
        <img 
          src="/sycure-logo.webp"
          alt="Sycure.ai - AI, Cybersecurity, Bitcoin & Quantum Insights"
          className="h-8 md:h-10 w-auto"

          width={890}
          height={179}
          fetchPriority="high"
        />
      </button>
    </div>
  );
}
