import { create } from "zustand";
import type { SortBy, TokenListStatus } from "./types";

interface FilterState {
  search: string;
  status: TokenListStatus;
  sortBy: SortBy;
  setSearch: (s: string) => void;
  setStatus: (s: TokenListStatus) => void;
  setSortBy: (s: SortBy) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  search: "",
  status: "all",
  sortBy: "newest",
  setSearch: (search) => set({ search }),
  setStatus: (status) => set({ status }),
  setSortBy: (sortBy) => set({ sortBy }),
  reset: () => set({ search: "", status: "all", sortBy: "newest" }),
}));
