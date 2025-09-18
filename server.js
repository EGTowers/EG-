import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";
import ytdl from "ytdl-core";

const app = express();
app.use(bodyParser.json());

// --- הגדרות גוגל ---
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// --- דף בית ---
app.get("/", (req, res) => {
  res.send("🎉 השרת פעיל! שלח בקשה ל־/upload כדי להעלות קובץ או סרטון ל־Drive.");
});

// --- בדיקת תיקייה ---
app.get("/test-folder", async (req, res) => {
  try {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    console.log("🔎 בודק גישה לתיקייה:", folderId);

    const list = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: "files(id, name)",
      pageSize: 5,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
    });

    res.json({
      success: true,
      message: "✅ ה־Service Account הצליח לגשת לתיקייה",
      files: list.data.files,
    });
  } catch (err) {
    console.error("❌ שגיאה בבדיקת תיקייה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- העלאה ל־Drive ---
async function uploadToDrive(bufferOrStream, mimeType, folderId, fileName) {
  console.log("📤 מעלה ל־Drive...");

  const metadata = {
    name: fileName || "file_" + Date.now(),
    parents: [folderId],
  };

  const media = {
    mimeType: mimeType || "application/octet-stream",
    body: bufferOrStream,
  };

  const response = await drive.files.create({
    requestBody: metadata,
    media,
    fields: "id, name",
    supportsAllDrives: true,
  });

  console.log("✅ הועלה בהצלחה ל־Drive:", response.data);
  return response.data;
}

// --- נקודת קצה להעלאה ---
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "❌ חסר קישור" });
  }

  res.json({ success: true, message: "✅ הקישור התקבל, מתחילים בתהליך..." });

  try {
    const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    // בדיקה אם זה קישור YouTube
    if (ytdl.validateURL(url)) {
      console.log("⏳ מזהה קישור YouTube:", url);

      try {
        console.log("📥 מתחיל הורדה מ־YouTube...");
        const stream = ytdl(url, { quality: "highest" });

        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^\w\sא-ת.-]/g, "_");

        await uploadToDrive(stream, "video/mp4", targetFolder, title + ".mp4");
      } catch (err) {
        console.error("❌ שגיאת YouTube:", err.message);
      }
    } else {
      console.log("⏳ מוריד קובץ רגיל:", url);

      const response = await fetch(url);
      if (!response.ok) throw new Error(`שגיאת הורדה: ${response.statusText}`);

      const buffer = await response.buffer();
      console.log(`📏 גודל קובץ: ${buffer.length} bytes`);

      const stream = Readable.from(buffer);
      const mimeType = response.headers.get("content-type");

      await uploadToDrive(stream, mimeType, targetFolder, "file_" + Date.now());
    }

    console.log("🎉 התהליך הסתיים בהצלחה!");
  } catch (err) {
    console.error("❌ שגיאה כללית בתהליך:", err.message);
  }
});

// --- מאזין לשרת ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
