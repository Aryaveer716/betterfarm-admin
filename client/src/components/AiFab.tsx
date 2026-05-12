import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiFabProps {
  onClick: () => void;
  className?: string;
  hidden?: boolean;
}

/**
 * Fixed-position floating action button that opens the admin AI assistant
 * panel. Visually mirrors the apps/main AICopilotButton (the farmer-facing
 * Dusty FAB) — same green, same circular shape, same shadow — so admins
 * recognize it as the same persona surface. Re-implemented as a web
 * component; nothing is imported from apps/main.
 *
 * Position: bottom-right, 24px safe margin, z-40 (above dashboard content,
 * below shadcn modals which use z-50).
 */
export function AiFab({ onClick, className, hidden }: AiFabProps) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open AI assistant"
      className={cn(
        // Fixed positioning + z-index
        "fixed bottom-6 right-6 z-40",
        // 64x64 circle to match apps/main FAB (width: 64, height: 64, borderRadius: 32)
        "w-16 h-16 rounded-full",
        // Color: #1B6B3A (BetterFarm green) — hardcoded since this is a literal mirror
        "bg-[#1B6B3A] hover:bg-[#1f7a44] active:bg-[#185e34]",
        // Shadow approximating shadowColor:#1B6B3A, offset:{0,4}, opacity:0.4, radius:8
        "shadow-[0_4px_8px_rgba(27,107,58,0.4)]",
        // Subtle white border like the apps/main FAB
        "border border-white/10",
        // Focus + press behavior
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B3A] focus-visible:ring-offset-2",
        "active:scale-95",
        "flex items-center justify-center",
        // Disabled visual state if needed (caller supplies via className override)
        className,
      )}
    >
      <Sparkles className="size-6 text-white" />
    </button>
  );
}
