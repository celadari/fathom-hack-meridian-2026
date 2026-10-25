// The one hook screens read data from. Phase 4: mock data. Phase 5 swaps the
// source for testnet reads without touching the screens.
import { MOCK } from "./mock";
import type { FathomData } from "./types";

export function useFathom(): FathomData {
  return MOCK;
}
