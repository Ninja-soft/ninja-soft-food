import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge de clases Tailwind — idéntico al POS. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
