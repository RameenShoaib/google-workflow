// // server.js
// const express = require("express");
// const mysql = require("mysql2");

// const app = express();
// const PORT = 3000;

// // Middleware to parse JSON
// app.use(express.json());

// // MySQL connection (with leading space in DB name)
// const db = mysql.createConnection({
//   host: "localhost",
//   user: "root",        // your MySQL username
//   password: "",        // your MySQL password
//   database: " googleformsdb"  // keep the space as your DB has it
// });

// // Connect to MySQL
// db.connect((err) => {
//   if (err) {
//     return console.error("DB Connection error:", err);
//   }
//   console.log("Connected to MySQL database!");
// });

// // Test route for browser
// app.get("/", (req, res) => {
//   res.send("Node.js API is running. Use POST /save-form to send data.");
// });

// // POST route to save form submissions
// app.post("/save-form", (req, res) => {
//   const data = req.body;

//   // Validate required fields
//   if (!data.full_name || !data.contact_number || !data.email) {
//     return res.status(400).send("Missing required fields");
//   }

//   const sql = "INSERT INTO form_submissions (full_name, contact_number, email) VALUES (?, ?, ?)";
//   console.log("SQL:", sql);
//   console.log("Data:", [data.full_name, data.contact_number, data.email]);

//   db.query(sql, [data.full_name, data.contact_number, data.email], (err, result) => {
//     if (err) {
//       console.error("DB Error details:", err);
//       return res.status(500).send(`Database insert error: ${err.sqlMessage}`);
//     }
//     res.send("Saved Success");
//   });
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`API running on port ${PORT}`);
// });



// server.js
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
require("dotenv").config();


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// MySQL connection (Aiven - uses environment variables)
const db = mysql.createConnection({
  host: process.env.DB_HOST,       // Aiven Host
  port: process.env.DB_PORT,       // Aiven Port
  user: process.env.DB_USER,       // avnadmin
  password: process.env.DB_PASS,   // Aiven password
  database: process.env.DB_NAME,   // defaultdb
  ssl: { rejectUnauthorized: false }
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error("❌ DB Connection error:", err);
    return;
  }
  console.log("✅ Connected to Aiven MySQL!");
});

// Test route
app.get("/", (req, res) => {
  res.send("Node.js API is running. Use POST /save-form to send data.");
});

// ⬅️ TEMP ROUTE TO CREATE TABLE IN AIVEN
app.get("/create-table", (req, res) => {
  const sql = `
    CREATE TABLE IF NOT EXISTS form_submissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(255),
      contact_number VARCHAR(100),
      email VARCHAR(255),
      submitted_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(sql, (err) => {
    if (err) {
      console.log("❌ Table creation error:", err);
      return res.send("Table creation error: " + err);
    }
    res.send("✅ Table 'form_submissions' created successfully!");
  });
});

// MAIN ENDPOINT for saving Google Form data
app.post("/save-form", (req, res) => {
  const data = req.body;

  console.log("Incoming Data:", data);

  // Validate
  if (!data.full_name || !data.contact_number || !data.email) {
    return res.status(400).send("Missing required fields");
  }

  const sql = `
    INSERT INTO form_submissions (full_name, contact_number, email)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [data.full_name, data.contact_number, data.email], (err, result) => {
    if (err) {
      console.error("❌ DB Insert Error:", err);
      return res.status(500).send("Database insert error: " + err.sqlMessage);
    }

    res.send("✅ Saved Successfully");
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
