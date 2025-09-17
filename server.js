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

// נקודת קצה להעלאה (POST JSON)
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "❌ חסר קישור להורדה" });
  }

  // מחזירים תגובה מהירה ללקוח
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

    // הופכים את ה־Buffer לזרם
    const stream = Readable.from(buffer);

    const media = {
      mimeType: response.headers.get("content-type") || "application/octet-stream",
      body: stream,
    };

    const uploadResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name",
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


app.get("/list", async (req, res) => {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const list = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name)"
    });
    res.json(list.data.files);
  } catch (err) {
    console.error("❌ Error listing files:", err.message);
    res.status(500).send(err.message);
  }
});
