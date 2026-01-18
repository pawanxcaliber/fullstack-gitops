const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 5000;

// Connect to Postgres using Env Vars (which we will set in K8s next)
const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
});

app.get('/', async (req, res) => {
    try {
        // Try to query the database
        const result = await pool.query('SELECT NOW()');
        res.json({
            message: "✅ Backend successfully connected to Postgres Database!",
            db_time: result.rows[0].now
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "❌ Database Connection Failed",
            error: err.message
        });
    }
});

app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
