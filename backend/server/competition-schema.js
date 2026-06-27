const fs = require('fs');
const path = require('path');

const migrationFiles = [
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '202606260001_create_competitions.sql'),
    path.join(__dirname, '..', '..', 'supabase', 'migrations', '202606270001_fix_competition_trigger_functions.sql'),
];

let schemaPromise = null;

const isMissingRelationError = error => error && error.code === '42P01';

const applyCompetitionMigrations = async pool => {
    for (const file of migrationFiles) {
        const sql = fs.readFileSync(file, 'utf8');
        await pool.query(sql);
    }
};

const ensureCompetitionSchema = async pool => {
    if (schemaPromise) {
        return schemaPromise;
    }

    schemaPromise = (async () => {
        try {
            await pool.query('SELECT id FROM competitions LIMIT 1');
        } catch (error) {
            if (!isMissingRelationError(error)) {
                throw error;
            }

            await applyCompetitionMigrations(pool);
        }
    })().catch(error => {
        schemaPromise = null;
        throw error;
    });

    return schemaPromise;
};

module.exports = {
    ensureCompetitionSchema,
    applyCompetitionMigrations,
    migrationFiles,
    isMissingRelationError,
};
