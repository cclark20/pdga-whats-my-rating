import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** A single muted line near the content it affects (DESIGN.md "Notices"). */
export default function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-ui text-muted">
      <Info size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
