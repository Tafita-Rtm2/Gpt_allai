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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                model TEXT NOT NULL,
                messages TEXT NOT NULL,
                response TEXT NOT NULL,
                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Chat history table is ready.');

    } catch (err) {
        console.error('Error initializing database:', err.stack);
    }
};

module.exports = {
    db: pool, // We'll use the pool as our db object
    initializeDatabase
};
