const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const COMPETITION_ACCOUNT_HASH_SALT = process.env.COMPETITION_ACCOUNT_HASH_SALT || 'risk-managers-competition-salt';

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
    const result = await pool.query('SELECT * FROM competitions WHERE slug = $1', [slug]);
    return result.rows[0] || null;
};

const getLeaderboardByCompetitionId = async competitionId => {
    const result = await pool.query(
        `SELECT cp.competition_id, cp.id AS participant_id, cp.username, cp.masked_account_id,
                cp.account_currency, cr.starting_balance, cr.current_balance, cr.adjusted_profit,
                cr.growth_percentage, cr.current_rank, cr.previous_rank, cr.last_balance_update_at
         FROM competition_participants cp
         JOIN competition_results cr ON cr.participant_id = cp.id
         WHERE cp.competition_id = $1
           AND cp.registration_status = 'verified'
           AND cp.is_real_account = true
         ORDER BY cr.current_rank ASC NULLS LAST`,
        [competitionId]
    );

    return result.rows.sort((left, right) => {
        const leftRank = left.current_rank ?? Number.MAX_SAFE_INTEGER;
        const rightRank = right.current_rank ?? Number.MAX_SAFE_INTEGER;

        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }

        return Number(right.growth_percentage || 0) - Number(left.growth_percentage || 0);
    });
};

const refreshRankings = async (client, competitionId) => {
    await client.query(
        `UPDATE competition_results cr
         SET adjusted_profit = CASE
                WHEN COALESCE(cr.starting_balance, 0) <= 0 THEN 0
                ELSE ROUND(COALESCE(cr.current_balance, 0) - COALESCE(cr.starting_balance, 0)
                     - COALESCE(cr.deposits, 0) + COALESCE(cr.withdrawals, 0), 2)
             END,
             growth_percentage = CASE
                WHEN COALESCE(cr.starting_balance, 0) <= 0 THEN 0
                ELSE ROUND(((COALESCE(cr.current_balance, 0) - COALESCE(cr.starting_balance, 0)
                     - COALESCE(cr.deposits, 0) + COALESCE(cr.withdrawals, 0)) / cr.starting_balance) * 100, 6)
             END
         WHERE cr.competition_id = $1`,
        [competitionId]
    );

    await client.query(
        `UPDATE competition_results cr
         SET previous_rank = cr.current_rank,
             current_rank = ranked.next_rank
         FROM (
             SELECT id,
                    ROW_NUMBER() OVER (
                        ORDER BY growth_percentage DESC NULLS LAST,
                                 adjusted_profit DESC NULLS LAST,
                                 last_balance_update_at ASC NULLS LAST,
                                 id ASC
                    ) AS next_rank
             FROM competition_results
             WHERE competition_id = $1
         ) ranked
         WHERE cr.id = ranked.id`,
        [competitionId]
    );
};

const getParticipantSnapshot = async participantId => {
    const participantResult = await pool.query(
        `SELECT id, competition_id, username, username_normalized, deriv_account_hash,
                masked_account_id, account_currency, is_real_account, is_account_verified,
                registration_status, joined_at
         FROM competition_participants WHERE id = $1`,
        [participantId]
    );
    const participant = participantResult.rows[0] || null;

    if (!participant) {
        return null;
    }

    const resultRows = await pool.query(
        `SELECT competition_id, participant_id, starting_balance, current_balance, deposits,
                withdrawals, adjusted_profit, growth_percentage, current_rank, previous_rank, last_balance_update_at
         FROM competition_results WHERE participant_id = $1`,
        [participantId]
    );

    return {
        participant,
        result: resultRows.rows[0] || null,
    };
};

router.get('/:slug', async (req, res, next) => {
    try {
        const competition = await getCompetitionBySlug(req.params.slug);
        if (!competition) {
            return res.status(404).json({ error: 'Competition not found.' });
        }

        const participants = await pool.query(
            'SELECT id, registration_status, is_real_account FROM competition_participants WHERE competition_id = $1',
            [competition.id]
        );

        res.json({
            ...competition,
            participants_count: participants.rows.length,
            verified_participants_count: participants.rows.filter(
                p => p.registration_status === 'verified' && p.is_real_account
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

        const existing = await pool.query(
            'SELECT id FROM competition_participants WHERE competition_id = $1 AND username_normalized = $2',
            [competition.id, usernameNormalized]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'That username has already been taken in this competition.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const participantResult = await client.query(
                `INSERT INTO competition_participants (competition_id, username, username_normalized, registration_status)
                 VALUES ($1, $2, $3, 'pending')
                 RETURNING *`,
                [competition.id, usernameNormalized, usernameNormalized]
            );
            const insertedParticipant = participantResult.rows[0];

            const resultRow = await client.query(
                `INSERT INTO competition_results (competition_id, participant_id, current_balance, deposits, withdrawals, adjusted_profit, growth_percentage)
                 VALUES ($1, $2, 0, 0, 0, 0, 0)
                 RETURNING *`,
                [competition.id, insertedParticipant.id]
            );

            await client.query('COMMIT');

            res.status(201).json({
                participant: insertedParticipant,
                result: resultRow.rows[0] || null,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
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
        const duplicateAccounts = await pool.query(
            'SELECT id FROM competition_participants WHERE competition_id = $1 AND deriv_account_hash = $2',
            [competition.id, derivAccountHash]
        );

        if (duplicateAccounts.rows.some(item => item.id !== participantId)) {
            return res.status(409).json({ error: 'That Deriv account is already registered in this competition.' });
        }

        const snapshot = await getParticipantSnapshot(participantId);
        if (!snapshot) {
            return res.status(404).json({ error: 'Participant not found.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updatedParticipantResult = await client.query(
                `UPDATE competition_participants
                 SET deriv_account_hash = $1, masked_account_id = $2, account_currency = $3,
                     is_real_account = true, is_account_verified = true, registration_status = 'verified'
                 WHERE id = $4
                 RETURNING *`,
                [
                    derivAccountHash,
                    maskAccountId(accountId),
                    accountCurrency || snapshot.participant.account_currency || competition.currency || 'USD',
                    participantId,
                ]
            );

            const resultPayload = calculateCompetitionGrowth({
                startingBalance: Number(snapshot.result?.starting_balance || 0),
                currentBalance,
                deposits: 0,
                withdrawals: 0,
            });

            const updatedResultRow = await client.query(
                `UPDATE competition_results
                 SET current_balance = $1, adjusted_profit = $2, growth_percentage = $3, last_balance_update_at = NOW()
                 WHERE participant_id = $4
                 RETURNING *`,
                [
                    Number(currentBalance.toFixed(2)),
                    resultPayload.adjustedProfit,
                    resultPayload.growthPercentage,
                    participantId,
                ]
            );

            await refreshRankings(client, competition.id);
            await client.query('COMMIT');

            res.json({
                participant: updatedParticipantResult.rows[0],
                result: updatedResultRow.rows[0] || null,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
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

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updatedResultRow = await client.query(
                `UPDATE competition_results
                 SET current_balance = $1, adjusted_profit = $2, growth_percentage = $3, last_balance_update_at = NOW()
                 WHERE participant_id = $4
                 RETURNING *`,
                [Number(currentBalance.toFixed(2)), growth.adjustedProfit, growth.growthPercentage, participantId]
            );

            const competitionId = snapshot.participant.competition_id;
            await refreshRankings(client, competitionId);
            await client.query('COMMIT');

            res.json({
                participant: snapshot.participant,
                result: updatedResultRow.rows[0] || null,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        next(error);
    }
});

router.post('/:competitionId/admin/action', async (req, res, next) => {
    try {
        const { competitionId } = req.params;
        const { action } = req.body || {};

        const competitionResult = await pool.query('SELECT * FROM competitions WHERE id = $1', [competitionId]);
        const competition = competitionResult.rows[0];
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
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                await client.query("UPDATE competitions SET status = 'locked' WHERE id = $1", [competitionId]);

                const verifiedParticipants = await client.query(
                    `SELECT id FROM competition_participants
                     WHERE competition_id = $1 AND registration_status = 'verified' AND is_real_account = true`,
                    [competitionId]
                );

                for (const row of verifiedParticipants.rows) {
                    const resultRows = await client.query(
                        'SELECT id, current_balance FROM competition_results WHERE participant_id = $1',
                        [row.id]
                    );
                    const result = resultRows.rows[0];
                    if (result) {
                        await client.query(
                            `UPDATE competition_results
                             SET starting_balance = $1, last_balance_update_at = NOW()
                             WHERE id = $2`,
                            [Number(Number(result.current_balance || 0).toFixed(2)), result.id]
                        );
                    }
                }

                const updatedComp = await client.query(
                    `UPDATE competitions SET status = 'live', actual_started_at = NOW() WHERE id = $1 RETURNING *`,
                    [competitionId]
                );

                await client.query(
                    `INSERT INTO competition_admin_actions (competition_id, action, actor, metadata)
                     VALUES ($1, $2, 'competition-admin-ui', $3)`,
                    [competitionId, action, JSON.stringify({ executed_at: new Date().toISOString() })]
                );

                await client.query('COMMIT');
                return res.json({ competition: updatedComp.rows[0] || competition });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            return res.status(400).json({ error: 'Unknown admin action.' });
        }

        const setParts = Object.keys(patch).map((key, i) => `${key} = $${i + 2}`);
        const values = Object.values(patch);
        const updatedComp = await pool.query(
            `UPDATE competitions SET ${setParts.join(', ')} WHERE id = $1 RETURNING *`,
            [competitionId, ...values]
        );

        await pool.query(
            `INSERT INTO competition_admin_actions (competition_id, action, actor, metadata)
             VALUES ($1, $2, 'competition-admin-ui', $3)`,
            [competitionId, action, JSON.stringify({ executed_at: new Date().toISOString() })]
        );

        res.json({ competition: updatedComp.rows[0] || competition });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
