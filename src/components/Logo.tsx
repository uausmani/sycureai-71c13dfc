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
          className="h-16 md:h-20 w-auto"

          width={1000}
          height={277}
          fetchPriority="high"
        />
      </button>
    </div>
  );
}
