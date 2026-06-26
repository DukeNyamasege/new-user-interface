import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@/features/competition/types/competition.types';

type LeaderboardState = {
    entries: LeaderboardEntry[];
    isLoading: boolean;
    error: string | null;
};

const DEFAULT_COMPETITION_SLUG = 'giftbaris-2026-july';

export const useLeaderboard = (slug = DEFAULT_COMPETITION_SLUG) => {
    const [state, setState] = useState<LeaderboardState>({
        entries: [],
        isLoading: true,
        error: null,
    });

    useEffect(() => {
        let isMounted = true;

        const fetchLeaderboard = async () => {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            try {
                const response = await fetch(`/api/competitions/${slug}/leaderboard`);
                const payload = await response.json();

                if (!response.ok) {
                    throw new Error(payload.error || 'Unable to load the competition leaderboard.');
                }

                if (!isMounted) {
                    return;
                }

                setState({
                    entries: (payload.entries || []) as LeaderboardEntry[],
                    isLoading: false,
                    error: null,
                });
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setState({
                    entries: [],
                    isLoading: false,
                    error: error instanceof Error ? error.message : 'Unable to load the competition leaderboard.',
                });
            }
        };

        void fetchLeaderboard();
        const intervalId = window.setInterval(() => {
            void fetchLeaderboard();
        }, 15000);

        return () => {
            isMounted = false;
            window.clearInterval(intervalId);
        };
    }, [slug]);

    return state;
};
