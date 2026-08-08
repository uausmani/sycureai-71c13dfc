import sycureMark from "@/assets/sycure-mark.png";

interface LogoProps {
  onClick?: () => void;
}

export function Logo({ onClick }: LogoProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 focus:outline-none"
      aria-label="Sycure home"
    >
      <span
        aria-hidden="true"
        className="w-8 h-8 bg-primary select-none"
        style={{
          WebkitMaskImage: `url(${sycureMark})`,
          maskImage: `url(${sycureMark})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
      <div className="flex items-baseline gap-0.5 leading-none">
        <span className="text-lg font-semibold tracking-tight text-foreground">Sycure</span>
        <span className="text-lg font-light tracking-tight text-primary">.ai</span>
      </div>
    </button>
  );
}
