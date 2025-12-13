// server.js
const express = require("express");
const mysql = require("mysql2/promise"); // UPDATED: Using promise version for async/await
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// --- DATABASE CONNECTION POOL ---
// We use a POOL instead of a single connection. 
// It automatically manages multiple users hitting the server at once.
const pool = mysql.createPool({
  host: process.env.DB_HOST,       // Your Aiven Host
  port: process.env.DB_PORT,       // Your Aiven Port
  user: process.env.DB_USER,       // avnadmin
  password: process.env.DB_PASS,   // Your Aiven Password
  database: process.env.DB_NAME,   // defaultdb
  ssl: { rejectUnauthorized: false }, // Keeps your existing SSL setting
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test Connection on Startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("✅ Connected to Aiven MySQL (Pool Active)!");
        connection.release();
    } catch (err) {
        console.error("❌ DB Connection error:", err);
    }
})();

// Test route
app.get("/", (req, res) => {
  res.send("Attendance System API is running.");
});

// --- MAIN ENDPOINT ---
// Used by Google Apps Script to send data
app.post("/api/submit-attendance", async (req, res) => {
  const data = req.body;
  console.log("Incoming Data:", data);

  // 1. Validation
  // Note: We check 'event_name' now instead of just contact info
  if (!data.email || !data.event_name) {
    return res.status(400).send("Missing required fields: email or event_name");
  }

  let connection;

  try {
    // Get a connection from the pool
    connection = await pool.getConnection();
    
    // START TRANSACTION (Safety Lock)
    await connection.beginTransaction();

    // --- STEP A: HANDLE PARTICIPANT (Find or Create) ---
    // Check if this email already exists in our 'participants' table
    const [existingUsers] = await connection.query(
        'SELECT participant_id FROM participants WHERE email = ?', 
        [data.email]
    );

    let participantId;

    if (existingUsers.length > 0) {
        // User exists, grab their ID
        participantId = existingUsers[0].participant_id;
    } else {
        // User is new, create them
        const [newUser] = await connection.query(
            'INSERT INTO participants (email, full_name, phone) VALUES (?, ?, ?)',
            [data.email, data.full_name, data.contact_number]
        );
        participantId = newUser.insertId;
    }

    // --- STEP B: FIND THE EVENT ---
    const [events] = await connection.query(
        'SELECT event_id, capacity FROM events WHERE event_title = ?', 
        [data.event_name]
    );

    if (events.length === 0) {
        throw new Error(`Event '${data.event_name}' not found. Admin needs to create it first.`);
    }

    const eventId = events[0].event_id;
    const maxCapacity = events[0].capacity;

    // --- STEP C: CHECK CAPACITY (Waitlist Logic) ---
    // Count how many people are confirmed
    const [countResult] = await connection.query(
        'SELECT COUNT(*) as count FROM attendance WHERE event_id = ? AND status = "confirmed"',
        [eventId]
    );
    const currentCount = countResult[0].count;

    // Decide Status
    let status = 'confirmed';
    if (currentCount >= maxCapacity) {
        status = 'waitlist'; // Capacity reached
    }

    // --- STEP D: RECORD ATTENDANCE ---
    await connection.query(
        'INSERT INTO attendance (participant_id, event_id, status) VALUES (?, ?, ?)',
        [participantId, eventId, status]
    );

    // COMMIT (Save everything)
    await connection.commit();

    console.log(`✅ Success: ${data.email} registered for ${data.event_name} as ${status}`);
    res.json({ status: "success", message: "Saved Successfully", attendance_status: status });

  } catch (err) {
    if (connection) await connection.rollback(); // Undo if error happens

    // Handle Duplicate Scans (User already registered)
    if (err.code === 'ER_DUP_ENTRY') {
        console.log(`⚠️ Duplicate: ${data.email} already registered.`);
        return res.status(200).json({ status: "exists", message: "Already Registered" });
    }

    console.error("❌ Server Error:", err.message);
    res.status(500).send("Server Error: " + err.message);
  } finally {
    if (connection) connection.release(); // Close connection
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
