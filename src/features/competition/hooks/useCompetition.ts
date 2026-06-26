import { useEffect, useState } from 'react';
import type { CompetitionRecord, ParticipantSnapshot } from '@/features/competition/types/competition.types';

const DEFAULT_COMPETITION_SLUG = 'giftbaris-2026-july';
const storageKey = (slug: string) => `competition:participant:${slug}`;

type UseCompetitionState = {
    competition: CompetitionRecord | null;
    participantSnapshot: ParticipantSnapshot | null;
    isLoading: boolean;
    isJoining: boolean;
    isRefreshingBalance: boolean;
    error: string | null;
};

export const useCompetition = (slug = DEFAULT_COMPETITION_SLUG) => {
    const [state, setState] = useState<UseCompetitionState>({
        competition: null,
        participantSnapshot: null,
        isLoading: true,
        isJoining: false,
        isRefreshingBalance: false,
        error: null,
    });

    const participantId = typeof window !== 'undefined' ? localStorage.getItem(storageKey(slug)) : null;

    const refreshCompetition = async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const competitionResponse = await fetch(`/api/competitions/${slug}`);
            const competitionPayload = await competitionResponse.json();

            if (!competitionResponse.ok) {
                throw new Error(competitionPayload.error || 'Unable to load the competition.');
            }

            let participantSnapshot = state.participantSnapshot;

            if (participantId) {
                const participantResponse = await fetch(`/api/competitions/${slug}/participants/${participantId}`);
                if (participantResponse.ok) {
                    participantSnapshot = (await participantResponse.json()) as ParticipantSnapshot;
                }
            }

            setState(prev => ({
                ...prev,
                competition: competitionPayload as CompetitionRecord,
                participantSnapshot,
                isLoading: false,
                error: null,
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unable to load the competition.',
            }));
        }
    };

    useEffect(() => {
        void refreshCompetition();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    const createPendingProfile = async (username: string) => {
        setState(prev => ({ ...prev, isJoining: true, error: null }));

        try {
            const response = await fetch(`/api/competitions/${slug}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unable to create your competition profile.');
            }

            localStorage.setItem(storageKey(slug), payload.participant.id);
            setState(prev => ({
                ...prev,
                participantSnapshot: payload as ParticipantSnapshot,
                isJoining: false,
            }));
            await refreshCompetition();
            return payload as ParticipantSnapshot;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to create your competition profile.';
            setState(prev => ({ ...prev, isJoining: false, error: message }));
            throw error;
        }
    };

    const connectAccount = async ({
        participantId: currentParticipantId,
        accountId,
        accountCurrency,
        currentBalance,
    }: {
        participantId: string;
        accountId: string;
        accountCurrency: string;
        currentBalance: number;
    }) => {
        setState(prev => ({ ...prev, isJoining: true, error: null }));

        try {
            const response = await fetch(`/api/competitions/${slug}/participants/${currentParticipantId}/connect-account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, accountCurrency, currentBalance }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unable to connect this Deriv account.');
            }

            setState(prev => ({
                ...prev,
                participantSnapshot: payload as ParticipantSnapshot,
                isJoining: false,
            }));
            await refreshCompetition();
            return payload as ParticipantSnapshot;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to connect this Deriv account.';
            setState(prev => ({ ...prev, isJoining: false, error: message }));
            throw error;
        }
    };

    const refreshParticipantBalance = async ({
        participantId: currentParticipantId,
        accountId,
        currentBalance,
    }: {
        participantId: string;
        accountId: string;
        currentBalance: number;
    }) => {
        setState(prev => ({ ...prev, isRefreshingBalance: true, error: null }));

        try {
            const response = await fetch(`/api/competitions/${slug}/participants/${currentParticipantId}/balance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId, currentBalance }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unable to refresh your competition balance.');
            }

            setState(prev => ({
                ...prev,
                participantSnapshot: payload as ParticipantSnapshot,
                isRefreshingBalance: false,
            }));
            await refreshCompetition();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to refresh your competition balance.';
            setState(prev => ({ ...prev, isRefreshingBalance: false, error: message }));
            throw error;
        }
    };

    const runAdminAction = async (competitionId: string, action: string) => {
        setState(prev => ({ ...prev, isJoining: true, error: null }));
        try {
            const response = await fetch(`/api/competitions/${competitionId}/admin/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || 'Unable to complete the admin action.');
            }

            setState(prev => ({
                ...prev,
                competition: payload.competition as CompetitionRecord,
                isJoining: false,
            }));
            await refreshCompetition();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to complete the admin action.';
            setState(prev => ({ ...prev, isJoining: false, error: message }));
            throw error;
        }
    };

    return {
        ...state,
        refreshCompetition,
        createPendingProfile,
        connectAccount,
        refreshParticipantBalance,
        runAdminAction,
        participantId,
    };
};
