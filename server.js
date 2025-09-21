import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";
import ytdl from "@distube/ytdl-core";  // ספריה עדכנית ל-YouTube

const app = express();
app.use(bodyParser.json());

// --- Google Auth ---
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// --- דף בית ---
app.get("/", (req, res) => {
  res.send("🎉 השרת פעיל! שלח בקשה ל־/upload כדי להעלות קובץ ל-Drive.");
});

// --- בדיקת תיקייה ---
app.get("/test-folder", async (req, res) => {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const list = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
      pageSize: 5,
    });

    res.json({ success: true, files: list.data.files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- העלאת קובץ / וידאו ---
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "❌ חסר קישור" });
  }

  try {
    const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
    let fileName = "file_" + Date.now();
    let mimeType = "application/octet-stream";
    let stream;

    // מזהה YouTube או קובץ רגיל
    if (ytdl.validateURL(url)) {
      console.log("⏳ מזהה קישור YouTube:", url);
      const info = await ytdl.getBasicInfo(url);
      fileName = info.videoDetails.title.replace(/[^\w\dא-ת\-_ ]/g, "") + ".mp4";
      mimeType = "video/mp4";
      stream = ytdl(url, { quality: "highest" });
    } else {
      console.log("⏳ מוריד קובץ רגיל:", url);
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`שגיאה בהורדה: ${response.statusText}`);

      fileName = decodeURIComponent(url.split("/").pop().split("?")[0]);
      mimeType = response.headers.get("content-type") || "application/octet-stream";
      const buffer = await response.buffer();
      stream = Readable.from(buffer);
    }

    console.log("📤 מעלה ל-Drive:", fileName);
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [targetFolder],
      },
      media: { mimeType, body: stream },
      fields: "id, name, mimeType, size",
      supportsAllDrives: true,
    });

    console.log("✅ הועלה בהצלחה:", uploadResponse.data);
    res.json({ success: true, file: uploadResponse.data });
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- הרצת השרת ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
