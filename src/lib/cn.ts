import clsx, { type ClassValue } from "clsx";

/** Class-name helper. Thin wrapper over clsx used across the component layer. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
