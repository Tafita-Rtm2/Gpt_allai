const { Pool } = require('pg');
require('dotenv').config();

// The user provided the connection string directly.
// In a real-world scenario, this should come from environment variables.
const connectionString = 'postgresql://neondb_owner:npg_Ba8KmGy1fMnv@ep-plain-hall-adyc959q-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false,
    },
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database.');
});

const initializeDatabase = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                auth_token TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table is ready.');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                provider TEXT NOT NULL,
                api_key TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('API keys table is ready.');

        // Chat history table is no longer needed.
        // We will drop it if it exists to clean up the database.
        await pool.query(`DROP TABLE IF EXISTS chat_history;`);
        console.log('Chat history table removed if it existed.');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS uploaded_files (
                id SERIAL PRIMARY KEY,
                file_id TEXT UNIQUE NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Uploaded files table is ready.');

        // Periodically clean up files older than 1 hour
        setInterval(async () => {
            try {
                const result = await pool.query("DELETE FROM uploaded_files WHERE created_at < NOW() - INTERVAL '1 hour'");
                if (result.rowCount > 0) {
                    console.log(`Cleaned up ${result.rowCount} old file(s).`);
                }
            } catch (err) {
                console.error('Error cleaning up old files:', err);
            }
        }, 60 * 60 * 1000); // Run every hour

    } catch (err) {
        console.error('Error initializing database:', err.stack);
    }
};

module.exports = {
    db: pool, // We'll use the pool as our db object
    initializeDatabase
};
