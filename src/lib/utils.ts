import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combineert className-strings en lost Tailwind-conflicten netjes op. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
