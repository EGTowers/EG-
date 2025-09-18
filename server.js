import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";

const app = express();
app.use(bodyParser.json());

// טוענים הרשאות מגוגל
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// דף בית לבדיקה
app.get("/", (req, res) => {
  res.send("🎉 השרת פעיל! שלח בקשה ל־/upload כדי להעלות קובץ ל-Drive.");
});

// נקודת בדיקה: הצגת קבצים בתיקיה
app.get("/list", async (req, res) => {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const list = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name)",
      includeItemsFromAllDrives: true,   // 🚩 חובה בדרייב שיתופי
      supportsAllDrives: true,           // 🚩 חובה בדרייב שיתופי
      corpora: "allDrives",              // 🚩 חובה בדרייב שיתופי
    });
    res.json(list.data.files);
  } catch (err) {
    console.error("❌ Error listing files:", err.message);
    res.status(500).send(err.message);
  }
});

// נקודת בדיקה: האם ה-Service Account רואה את התיקייה
app.get("/test-folder", async (req, res) => {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const list = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name)",
      pageSize: 5,
      includeItemsFromAllDrives: true,   // 🚩
      supportsAllDrives: true,           // 🚩
      corpora: "allDrives",              // 🚩
    });

    res.json({
      success: true,
      message: "✅ ה-Service Account הצליח לגשת לתיקייה",
      files: list.data.files
    });
  } catch (err) {
    console.error("❌ שגיאה בגישה לתיקייה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// נקודת קצה להעלאה
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "❌ חסר קישור להורדה" });
  }

  res.json({ success: true, message: "✅ הקישור התקבל, מתחילים בתהליך..." });

  try {
    console.log("⏳ מוריד קובץ:", url);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`שגיאה בהורדה: ${response.statusText}`);

    const buffer = await response.buffer();
    console.log(`📏 גודל קובץ: ${buffer.length} bytes`);

    const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    console.log("📤 מעלה ל-Drive...");
    const fileMetadata = {
      name: "file_" + Date.now(),
      parents: [targetFolder],
    };

    const stream = Readable.from(buffer);

    const media = {
      mimeType: response.headers.get("content-type") || "application/octet-stream",
      body: stream,
    };

    const uploadResponse = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, name",
      supportsAllDrives: true,   // 🚩 חובה בדרייב שיתופי
    });

    console.log("✅ הועלה בהצלחה ל-Drive:", uploadResponse.data);
  } catch (err) {
    console.error("❌ שגיאה בתהליך:", err.message);
  }
});

// מאזינים לשרת
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
