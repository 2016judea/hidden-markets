import { env } from "../env";
import { GooglePlacesDirectory } from "./googlePlaces";
import type { DirectoryProvider } from "./provider";

let cached: DirectoryProvider | null = null;

/** Null when no key is configured — discovery then falls back to the model. */
export function getDirectory(): DirectoryProvider | null {
  if (cached) return cached;
  if (!env.GOOGLE_PLACES_API_KEY) return null;
  cached = new GooglePlacesDirectory(env.GOOGLE_PLACES_API_KEY);
  return cached;
}

export function setDirectory(p: DirectoryProvider | null): void {
  cached = p;
}

export * from "./provider";
export { GooglePlacesDirectory } from "./googlePlaces";
