import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";
import ytdl from "@distube/ytdl-core";   // 📌 שים לב – עברנו ל־distube

const app = express();
app.use(bodyParser.json());

// הרשאות מה־Service Account
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// דף בית
app.get("/", (req, res) => {
  res.send("🎉 השרת פעיל! שלח בקשה ל־/upload כדי להעלות קובץ ל־Drive.");
});

// נקודת קצה להעלאה
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;
  if (!url) return res.status(400).json({ success: false, error: "❌ חסר קישור" });

  try {
    let fileName = "file_" + Date.now();
    let stream;
    let mimeType = "application/octet-stream";

    // בדיקה אם זה YouTube
    if (ytdl.validateURL(url)) {
      console.log("⏳ מזהה קישור YouTube:", url);

      const info = await ytdl.getInfo(url);
      fileName = `${info.videoDetails.title}.mp4`;
      mimeType = "video/mp4";

      console.log("📥 מתחיל הורדה מ־YouTube...");
      stream = ytdl(url, { quality: "highest" });
    } else {
      console.log("⏳ מוריד קובץ:", url);

      const response = await fetch(url, {
    headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    }
    });

      if (!response.ok) throw new Error(`שגיאה בהורדה: ${response.statusText}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      fileName = url.split("/").pop() || fileName;
      mimeType = response.headers.get("content-type") || "application/octet-stream";
      stream = Readable.from(buffer);
    }

    const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    console.log("📤 מעלה ל־Drive...");
    const uploadResponse = await drive.files.create({
      requestBody: { name: fileName, parents: [targetFolder] },
      media: { mimeType, body: stream },
      fields: "id, name",
      supportsAllDrives: true,
    });

    console.log("✅ הועלה בהצלחה:", uploadResponse.data);
    res.json({
      success: true,
      message: "✅ הועלה בהצלחה ל־Drive",
      file: uploadResponse.data,
    });
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// מאזינים
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

