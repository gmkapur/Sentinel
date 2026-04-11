import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistState {
    watchedIds: number[];
    add: (id: number) => void;
    remove: (id: number) => void;
    toggle: (id: number) => void;
    isWatched: (id: number) => boolean;
    clear: () => void;
}

export const useWatchlistStore = create<WatchlistState>()(
    persist(
        (set, get) => ({
            watchedIds: [],
            add: (id) =>
                set((s) => {
                    if (s.watchedIds.includes(id)) return s;
                    return { watchedIds: [...s.watchedIds, id] };
                }),
            remove: (id) =>
                set((s) => ({
                    watchedIds: s.watchedIds.filter((wid) => wid !== id),
                })),
            toggle: (id) => {
                const s = get();
                if (s.watchedIds.includes(id)) s.remove(id);
                else s.add(id);
            },
            isWatched: (id) => get().watchedIds.includes(id),
            clear: () => set({ watchedIds: [] }),
        }),
        { name: 'sentinel-watchlist' },
    ),
);
