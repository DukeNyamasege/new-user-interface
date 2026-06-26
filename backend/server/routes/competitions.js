const express = require('express');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPETITION_ACCOUNT_HASH_SALT = process.env.COMPETITION_ACCOUNT_HASH_SALT || 'risk-managers-competition-salt';

const jsonHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
};

const ensureSupabaseConfig = () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        const error = new Error('Supabase competition environment variables are missing.');
        error.status = 500;
        throw error;
    }
};

const supabaseRequest = async (path, options = {}) => {
    ensureSupabaseConfig();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            ...jsonHeaders,
            ...(options.headers || {}),
        },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const error = new Error(data?.message || data?.error || 'Competition request failed.');
        error.status = response.status;
        throw error;
    }

    return data;
};

const normalizeUsername = username => String(username || '').trim().toLowerCase();

const maskAccountId = accountId => {
    const value = String(accountId || '');
    const mask = '\u2022\u2022\u2022\u2022';

    if (value.length <= 6) {
        return `${value.slice(0, 2)}${mask}`;
    }

    return `${value.slice(0, 2)}${mask}${value.slice(-4)}`;
};

const hashAccountId = async accountId => {
    const encoder = new TextEncoder();
    const payload = encoder.encode(`${accountId}${COMPETITION_ACCOUNT_HASH_SALT}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', payload);
    return Buffer.from(hashBuffer).toString('hex');
};

const calculateCompetitionGrowth = ({ startingBalance, currentBalance, deposits, withdrawals }) => {
    if (Number(startingBalance) <= 0) {
        return { adjustedProfit: 0, growthPercentage: 0 };
    }

    const adjustedProfit =
        Number(currentBalance) - Number(startingBalance) - Number(deposits || 0) + Number(withdrawals || 0);
    const growthPercentage = (adjustedProfit / Number(startingBalance)) * 100;

    return {
        adjustedProfit: Number(adjustedProfit.toFixed(2)),
        growthPercentage: Number(growthPercentage.toFixed(6)),
    };
};

const getCompetitionBySlug = async slug => {
    const competitions = await supabaseRequest(`competitions?slug=eq.${encodeURIComponent(slug)}&select=*`);
    return competitions[0] || null;
};

const getLeaderboardByCompetitionId = async competitionId => {
    const leaderboard = await supabaseRequest(
        `public_competition_leaderboard?competition_id=eq.${encodeURIComponent(competitionId)}&select=*&order=current_rank.asc.nullslast`
    );

    return leaderboard.sort((left, right) => {
        const leftRank = left.current_rank ?? Number.MAX_SAFE_INTEGER;
        const rightRank = right.current_rank ?? Number.MAX_SAFE_INTEGER;

        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }

        return Number(right.growth_percentage || 0) - Number(left.growth_percentage || 0);
    });
};

const getParticipantSnapshot = async participantId => {
    const participants = await supabaseRequest(
        `competition_participants?id=eq.${encodeURIComponent(participantId)}&select=id,competition_id,username,username_normalized,deriv_account_hash,masked_account_id,account_currency,is_real_account,is_account_verified,registration_status,joined_at`
    );
    const participant = participants[0] || null;

    if (!participant) {
        return null;
    }

    const results = await supabaseRequest(
        `competition_results?participant_id=eq.${encodeURIComponent(participantId)}&select=competition_id,participant_id,starting_balance,current_balance,deposits,withdrawals,adjusted_profit,growth_percentage,current_rank,previous_rank,last_balance_update_at`
    );

    return {
        participant,
        result: results[0] || null,
    };
};

router.get('/:slug', async (req, res, next) => {
    try {
        const competition = await getCompetitionBySlug(req.params.slug);
        if (!competition) {
            return res.status(404).json({ error: 'Competition not found.' });
        }

        const participants = await supabaseRequest(
            `competition_participants?competition_id=eq.${encodeURIComponent(competition.id)}&select=id,registration_status,is_real_account`
        );

        res.json({
            ...competition,
            participants_count: participants.length,
            verified_participants_count: participants.filter(
                participant => participant.registration_status === 'verified' && participant.is_real_account
            ).length,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/:slug/leaderboard', async (req, res, next) => {
    try {
        const competition = await getCompetitionBySlug(req.params.slug);
        if (!competition) {
            return res.status(404).json({ error: 'Competition not found.' });
        }

        const leaderboard = await getLeaderboardByCompetitionId(competition.id);
        res.json({
            competition_id: competition.id,
            entries: leaderboard,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/:slug/join', async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { username } = req.body || {};
        const usernameNormalized = normalizeUsername(username);

        if (!/^[a-z0-9_]{3,20}$/.test(usernameNormalized)) {
            return res.status(400).json({ error: 'Username must be 3-20 characters using a-z, 0-9, or underscores.' });
        }

        const competition = await getCompetitionBySlug(slug);
        if (!competition) {
            return res.status(404).json({ error: 'Competition not found.' });
        }
        if (competition.status !== 'registration') {
            return res.status(409).json({ error: 'Competition registration is not open right now.' });
        }

        const existing = await supabaseRequest(
            `competition_participants?competition_id=eq.${competition.id}&username_normalized=eq.${encodeURIComponent(usernameNormalized)}&select=id`
        );

        if (existing.length > 0) {
            return res.status(409).json({ error: 'That username has already been taken in this competition.' });
        }

        const participant = await supabaseRequest('competition_participants', {
            method: 'POST',
            body: JSON.stringify({
                competition_id: competition.id,
                username: usernameNormalized,
                username_normalized: usernameNormalized,
                registration_status: 'pending',
            }),
        });

        const insertedParticipant = participant[0];

        const result = await supabaseRequest('competition_results', {
            method: 'POST',
            body: JSON.stringify({
                competition_id: competition.id,
                participant_id: insertedParticipant.id,
                current_balance: 0,
                deposits: 0,
                withdrawals: 0,
                adjusted_profit: 0,
                growth_percentage: 0,
            }),
        });

        res.status(201).json({
            participant: insertedParticipant,
            result: result[0] || null,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/:slug/participants/:participantId', async (req, res, next) => {
    try {
        const snapshot = await getParticipantSnapshot(req.params.participantId);
        if (!snapshot) {
            return res.status(404).json({ error: 'Participant not found.' });
        }

        res.json(snapshot);
    } catch (error) {
        next(error);
    }
});

router.post('/:slug/participants/:participantId/connect-account', async (req, res, next) => {
    try {
        const { slug, participantId } = req.params;
        const { accountId, accountCurrency, currentBalance } = req.body || {};

        if (!accountId || typeof currentBalance !== 'number') {
            return res.status(400).json({ error: 'Account ID and current balance are required.' });
        }

        const competition = await getCompetitionBySlug(slug);
        if (!competition) {
            return res.status(404).json({ error: 'Competition not found.' });
        }
        if (competition.status !== 'registration') {
            return res.status(409).json({ error: 'Account verification is only available during registration.' });
        }
        if (String(accountId).startsWith('VR')) {
            return res.status(400).json({ error: 'Demo accounts cannot join the competition.' });
        }

        const derivAccountHash = await hashAccountId(accountId);
        const duplicateAccounts = await supabaseRequest(
            `competition_participants?competition_id=eq.${competition.id}&deriv_account_hash=eq.${derivAccountHash}&select=id`
        );

        if (duplicateAccounts.some(item => item.id !== participantId)) {
            return res.status(409).json({ error: 'That Deriv account is already registered in this competition.' });
        }

        const snapshot = await getParticipantSnapshot(participantId);
        if (!snapshot) {
            return res.status(404).json({ error: 'Participant not found.' });
        }

        const updatedParticipants = await supabaseRequest(`competition_participants?id=eq.${encodeURIComponent(participantId)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                deriv_account_hash: derivAccountHash,
                masked_account_id: maskAccountId(accountId),
                account_currency: accountCurrency || snapshot.participant.account_currency || competition.currency || 'USD',
                is_real_account: true,
                is_account_verified: true,
                registration_status: 'verified',
            }),
        });

        const resultPayload = calculateCompetitionGrowth({
            startingBalance: Number(snapshot.result?.starting_balance || 0),
            currentBalance,
            deposits: 0,
            withdrawals: 0,
        });

        const updatedResults = await supabaseRequest(
            `competition_results?participant_id=eq.${encodeURIComponent(participantId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    current_balance: Number(currentBalance.toFixed(2)),
                    adjusted_profit: resultPayload.adjustedProfit,
                    growth_percentage: resultPayload.growthPercentage,
                    last_balance_update_at: new Date().toISOString(),
                }),
            }
        );

        res.json({
            participant: updatedParticipants[0],
            result: updatedResults[0] || null,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/:slug/participants/:participantId/balance', async (req, res, next) => {
    try {
        const { participantId } = req.params;
        const { accountId, currentBalance } = req.body || {};

        if (!accountId || typeof currentBalance !== 'number') {
            return res.status(400).json({ error: 'Account ID and current balance are required.' });
        }

        const snapshot = await getParticipantSnapshot(participantId);
        if (!snapshot) {
            return res.status(404).json({ error: 'Participant not found.' });
        }

        const incomingHash = await hashAccountId(accountId);
        if (incomingHash !== snapshot.participant.deriv_account_hash && snapshot.participant.deriv_account_hash) {
            return res.status(403).json({ error: 'That account does not match this participant.' });
        }

        const currentResult = snapshot.result || {
            starting_balance: 0,
            deposits: 0,
            withdrawals: 0,
        };

        const growth = calculateCompetitionGrowth({
            startingBalance: Number(currentResult.starting_balance || 0),
            currentBalance,
            deposits: Number(currentResult.deposits || 0),
            withdrawals: Number(currentResult.withdrawals || 0),
        });

        const updatedResults = await supabaseRequest(
            `competition_results?participant_id=eq.${encodeURIComponent(participantId)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    current_balance: Number(currentBalance.toFixed(2)),
                    adjusted_profit: growth.adjustedProfit,
                    growth_percentage: growth.growthPercentage,
                    last_balance_update_at: new Date().toISOString(),
                }),
            }
        );

        res.json({
            participant: snapshot.participant,
            result: updatedResults[0] || null,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/:competitionId/admin/action', async (req, res, next) => {
    try {
        const { competitionId } = req.params;
        const { action } = req.body || {};

        const competitions = await supabaseRequest(`competitions?id=eq.${encodeURIComponent(competitionId)}&select=*`);
        const competition = competitions[0];
        if (!competition) {
            return res.status(404).json({ error: 'Competition not found.' });
        }

        const patch = {};

        if (action === 'open_registration') {
            patch.status = 'registration';
        } else if (action === 'lock') {
            patch.status = 'locked';
        } else if (action === 'pause') {
            patch.status = 'paused';
            patch.actual_paused_at = new Date().toISOString();
        } else if (action === 'end') {
            patch.status = 'completed';
            patch.actual_ended_at = new Date().toISOString();
        } else if (action === 'start') {
            await supabaseRequest(`competitions?id=eq.${encodeURIComponent(competitionId)}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'locked' }),
            });

            const verifiedParticipants = await supabaseRequest(
                `competition_participants?competition_id=eq.${encodeURIComponent(competitionId)}&registration_status=eq.verified&is_real_account=eq.true&select=id`
            );

            await Promise.all(
                verifiedParticipants.map(row =>
                    supabaseRequest(
                        `competition_results?participant_id=eq.${encodeURIComponent(row.id)}&select=id,current_balance`
                    ).then(results => {
                        const result = results[0];
                        if (!result) {
                            return null;
                        }

                        return supabaseRequest(`competition_results?id=eq.${encodeURIComponent(result.id)}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                starting_balance: Number(Number(result.current_balance || 0).toFixed(2)),
                                last_balance_update_at: new Date().toISOString(),
                            }),
                        });
                    })
                )
            );

            patch.status = 'live';
            patch.actual_started_at = new Date().toISOString();
        } else {
            return res.status(400).json({ error: 'Unknown admin action.' });
        }

        const updatedCompetitions = await supabaseRequest(`competitions?id=eq.${encodeURIComponent(competitionId)}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
        });

        await supabaseRequest('competition_admin_actions', {
            method: 'POST',
            body: JSON.stringify({
                competition_id: competitionId,
                action,
                actor: 'competition-admin-ui',
                metadata: { executed_at: new Date().toISOString() },
            }),
        });

        res.json({ competition: updatedCompetitions[0] || competition });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
