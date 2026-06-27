const crypto = require('crypto');
const { pool } = require('../../backend/server/db');

const COMPETITION_ACCOUNT_HASH_SALT = process.env.COMPETITION_ACCOUNT_HASH_SALT || 'risk-managers-competition-salt';
const FUNCTION_PREFIX = '/.netlify/functions/competitions';
const API_PREFIX = '/api/competitions';

const json = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
});

const normalizeUsername = username => String(username || '').trim().toLowerCase();

const maskAccountId = accountId => {
    const value = String(accountId || '');
    const mask = '****';

    if (value.length <= 6) {
        return `${value.slice(0, 2)}${mask}`;
    }

    return `${value.slice(0, 2)}${mask}${value.slice(-4)}`;
};

const hashAccountId = accountId =>
    crypto.createHash('sha256').update(`${accountId}${COMPETITION_ACCOUNT_HASH_SALT}`).digest('hex');

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
        `SELECT id, competition_id, participant_id, starting_balance, current_balance, deposits,
                withdrawals, adjusted_profit, growth_percentage, current_rank, previous_rank, last_balance_update_at
         FROM competition_results WHERE participant_id = $1`,
        [participantId]
    );

    return {
        participant,
        result: resultRows.rows[0] || null,
    };
};

const parsePath = rawPath => {
    const path = rawPath.startsWith(FUNCTION_PREFIX)
        ? rawPath.slice(FUNCTION_PREFIX.length)
        : rawPath.startsWith(API_PREFIX)
          ? rawPath.slice(API_PREFIX.length)
          : rawPath;
    return path.replace(/^\/+/, '').split('/').filter(Boolean);
};

const getRequestBody = event => {
    if (!event.body) {
        return {};
    }

    try {
        return JSON.parse(event.body);
    } catch {
        return {};
    }
};

const handleGetCompetition = async slug => {
    const competition = await getCompetitionBySlug(slug);
    if (!competition) {
        return json(404, { error: 'Competition not found.' });
    }

    const participants = await pool.query(
        'SELECT id, registration_status, is_real_account FROM competition_participants WHERE competition_id = $1',
        [competition.id]
    );

    return json(200, {
        ...competition,
        participants_count: participants.rows.length,
        verified_participants_count: participants.rows.filter(
            participant => participant.registration_status === 'verified' && participant.is_real_account
        ).length,
    });
};

const handleGetLeaderboard = async slug => {
    const competition = await getCompetitionBySlug(slug);
    if (!competition) {
        return json(404, { error: 'Competition not found.' });
    }

    const leaderboard = await getLeaderboardByCompetitionId(competition.id);
    return json(200, {
        competition_id: competition.id,
        entries: leaderboard,
    });
};

const handleJoinCompetition = async (slug, body) => {
    const usernameNormalized = normalizeUsername(body.username);

    if (!/^[a-z0-9_]{3,20}$/.test(usernameNormalized)) {
        return json(400, { error: 'Username must be 3-20 characters using a-z, 0-9, or underscores.' });
    }

    const competition = await getCompetitionBySlug(slug);
    if (!competition) {
        return json(404, { error: 'Competition not found.' });
    }
    if (competition.status !== 'registration') {
        return json(409, { error: 'Competition registration is not open right now.' });
    }

    const existing = await pool.query(
        'SELECT id FROM competition_participants WHERE competition_id = $1 AND username_normalized = $2',
        [competition.id, usernameNormalized]
    );

    if (existing.rows.length > 0) {
        return json(409, { error: 'That username has already been taken in this competition.' });
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
        return json(201, {
            participant: insertedParticipant,
            result: resultRow.rows[0] || null,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const handleGetParticipant = async participantId => {
    const snapshot = await getParticipantSnapshot(participantId);
    if (!snapshot) {
        return json(404, { error: 'Participant not found.' });
    }

    return json(200, snapshot);
};

const handleConnectAccount = async (slug, participantId, body) => {
    const { accountId, accountCurrency, currentBalance } = body;

    if (!accountId || typeof currentBalance !== 'number') {
        return json(400, { error: 'Account ID and current balance are required.' });
    }

    const competition = await getCompetitionBySlug(slug);
    if (!competition) {
        return json(404, { error: 'Competition not found.' });
    }
    if (competition.status !== 'registration') {
        return json(409, { error: 'Account verification is only available during registration.' });
    }
    if (String(accountId).startsWith('VR')) {
        return json(400, { error: 'Demo accounts cannot join the competition.' });
    }

    const derivAccountHash = hashAccountId(accountId);
    const duplicateAccounts = await pool.query(
        'SELECT id FROM competition_participants WHERE competition_id = $1 AND deriv_account_hash = $2',
        [competition.id, derivAccountHash]
    );

    if (duplicateAccounts.rows.some(item => item.id !== participantId)) {
        return json(409, { error: 'That Deriv account is already registered in this competition.' });
    }

    const snapshot = await getParticipantSnapshot(participantId);
    if (!snapshot) {
        return json(404, { error: 'Participant not found.' });
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

        return json(200, {
            participant: updatedParticipantResult.rows[0],
            result: updatedResultRow.rows[0] || null,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const handleBalanceRefresh = async (participantId, body) => {
    const { accountId, currentBalance } = body;

    if (!accountId || typeof currentBalance !== 'number') {
        return json(400, { error: 'Account ID and current balance are required.' });
    }

    const snapshot = await getParticipantSnapshot(participantId);
    if (!snapshot) {
        return json(404, { error: 'Participant not found.' });
    }

    const incomingHash = hashAccountId(accountId);
    if (incomingHash !== snapshot.participant.deriv_account_hash && snapshot.participant.deriv_account_hash) {
        return json(403, { error: 'That account does not match this participant.' });
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

        await refreshRankings(client, snapshot.participant.competition_id);
        await client.query('COMMIT');

        return json(200, {
            participant: snapshot.participant,
            result: updatedResultRow.rows[0] || null,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const handleAdminAction = async (competitionId, body) => {
    const { action } = body;
    const competitionResult = await pool.query('SELECT * FROM competitions WHERE id = $1', [competitionId]);
    const competition = competitionResult.rows[0];

    if (!competition) {
        return json(404, { error: 'Competition not found.' });
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

            const updatedCompetition = await client.query(
                `UPDATE competitions SET status = 'live', actual_started_at = NOW() WHERE id = $1 RETURNING *`,
                [competitionId]
            );

            await client.query(
                `INSERT INTO competition_admin_actions (competition_id, action, actor, metadata)
                 VALUES ($1, $2, 'competition-admin-ui', $3)`,
                [competitionId, action, JSON.stringify({ executed_at: new Date().toISOString() })]
            );

            await client.query('COMMIT');
            return json(200, { competition: updatedCompetition.rows[0] || competition });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } else {
        return json(400, { error: 'Unknown admin action.' });
    }

    const setParts = Object.keys(patch).map((key, index) => `${key} = $${index + 2}`);
    const values = Object.values(patch);
    const updatedCompetition = await pool.query(
        `UPDATE competitions SET ${setParts.join(', ')} WHERE id = $1 RETURNING *`,
        [competitionId, ...values]
    );

    await pool.query(
        `INSERT INTO competition_admin_actions (competition_id, action, actor, metadata)
         VALUES ($1, $2, 'competition-admin-ui', $3)`,
        [competitionId, action, JSON.stringify({ executed_at: new Date().toISOString() })]
    );

    return json(200, { competition: updatedCompetition.rows[0] || competition });
};

exports.handler = async event => {
    try {
        const segments = parsePath(event.path || '');
        const method = event.httpMethod;
        const body = getRequestBody(event);

        if (method === 'GET' && segments.length === 1) {
            return await handleGetCompetition(segments[0]);
        }

        if (method === 'GET' && segments.length === 2 && segments[1] === 'leaderboard') {
            return await handleGetLeaderboard(segments[0]);
        }

        if (method === 'POST' && segments.length === 2 && segments[1] === 'join') {
            return await handleJoinCompetition(segments[0], body);
        }

        if (segments.length === 3 && segments[1] === 'participants' && method === 'GET') {
            return await handleGetParticipant(segments[2]);
        }

        if (segments.length === 4 && segments[1] === 'participants' && segments[3] === 'connect-account' && method === 'POST') {
            return await handleConnectAccount(segments[0], segments[2], body);
        }

        if (segments.length === 4 && segments[1] === 'participants' && segments[3] === 'balance' && method === 'POST') {
            return await handleBalanceRefresh(segments[2], body);
        }

        if (segments.length === 3 && segments[1] === 'admin' && segments[2] === 'action' && method === 'POST') {
            return await handleAdminAction(segments[0], body);
        }

        return json(404, { error: 'Competition route not found.' });
    } catch (error) {
        console.error('[netlify-functions][competitions]', error);
        return json(error.status || 500, {
            error: error.message || 'Internal Server Error',
        });
    }
};
