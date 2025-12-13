// server.js
const express = require("express");
const mysql = require("mysql2/promise"); 
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// --- DATABASE CONNECTION POOL (Fixed for "Sleep" Issues) ---
const pool = mysql.createPool({
  host: process.env.DB_HOST,       
  port: process.env.DB_PORT,       
  user: process.env.DB_USER,       
  password: process.env.DB_PASS,   
  database: process.env.DB_NAME,   
  ssl: { rejectUnauthorized: false }, 
  
  // ANTI-SLEEP SETTINGS
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true, // Pings DB to keep connection open
  keepAliveInitialDelay: 0
});

// Test DB Connection on Startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("✅ DB Connected Successfully!");
        connection.release();
    } catch (err) {
        console.error("❌ Startup DB Error:", err.message);
    }
})();

// Health Check Route (Use this to ping your server)
app.get("/", (req, res) => {
  res.send("Server is Awake and Running.");
});

// --- MAIN SUBMISSION ENDPOINT ---
app.post("/api/submit-attendance", async (req, res) => {
  const data = req.body;
  console.log("📥 Incoming Data:", JSON.stringify(data)); // Log input for debugging

  // 1. Validation
  if (!data.email || !data.event_name) {
    console.error("❌ Error: Missing Email or Event Name");
    return res.status(400).json({ status: "error", message: "Missing email or event_name" });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // --- STEP A: HANDLE PARTICIPANT ---
    // Check if user exists
    const [existingUsers] = await connection.query(
        'SELECT participant_id FROM participants WHERE email = ?', 
        [data.email]
    );

    let participantId;

    if (existingUsers.length > 0) {
        participantId = existingUsers[0].participant_id;
    } else {
        // Create new user (Includes ID Card Num)
        const [newUser] = await connection.query(
            'INSERT INTO participants (email, full_name, phone, identity_card_num) VALUES (?, ?, ?, ?)',
            [data.email, data.full_name, data.contact_number, data.identity_card_num || null]
        );
        participantId = newUser.insertId;
    }

    // --- STEP B: FIND THE EVENT (Crucial Step) ---
    // This is where 500 errors usually happen if names don't match
    const [events] = await connection.query(
        'SELECT event_id, capacity FROM events WHERE event_title = ?', 
        [data.event_name]
    );

    if (events.length === 0) {
        console.error(❌ Event Not Found: '${data.event_name}');
        await connection.rollback();
        // Return 400 (Bad Request) instead of 500 so we know it's logic, not a crash
        return res.status(400).json({ status: "error", message: Event '${data.event_name}' not found in DB. });
    }

    const eventId = events[0].event_id;
    const maxCapacity = events[0].capacity;

    // --- STEP C: CHECK CAPACITY ---
    const [countResult] = await connection.query(
        'SELECT COUNT(*) as count FROM attendance WHERE event_id = ? AND status = "confirmed"',
        [eventId]
    );
    const currentCount = countResult[0].count;

    let status = 'confirmed';
    if (currentCount >= maxCapacity) {
        status = 'waitlist';
    }

    // --- STEP D: RECORD ATTENDANCE ---
    await connection.query(
        'INSERT INTO attendance (participant_id, event_id, status) VALUES (?, ?, ?)',
        [participantId, eventId, status]
    );

    await connection.commit();
    console.log(✅ Success: ${data.email} -> ${status});
    
    res.json({ status: "success", attendance_status: status });

  } catch (err) {
    if (connection) await connection.rollback();

    // Handle Duplicate Entry
    if (err.code === 'ER_DUP_ENTRY') {
        console.log(⚠ Duplicate Scan: ${data.email});
        return res.status(200).json({ status: "exists", message: "Already Registered" });
    }

    console.error("🔥 SERVER CRASH:", err); // detailed log
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

app.listen(PORT, () => {
  console.log(🚀 Server running on port ${PORT});
});
