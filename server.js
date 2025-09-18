import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";
import ytdl from "@distube/ytdl-core";   // ✅ גרסה מתוחזקת

const app = express();
app.use(bodyParser.json());

// טוענים הרשאות מגוגל
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// פונקציה שולחת עדכון חזרה ל־Google Apps Script
async function notifyScript(status) {
  try {
    if (process.env.GSCRIPT_WEBHOOK) {
      await fetch(process.env.GSCRIPT_WEBHOOK, {
        method: "post",
        contentType: "application/json",
        body: JSON.stringify(status),
      });
    }
  } catch (e) {
    console.error("❌ שגיאה בשליחת עדכון לסקריפט:", e.message);
  }
}

// נקודת קצה להעלאה
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;
  const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!url) {
    return res.status(400).json({ success: false, error: "❌ חסר קישור להורדה" });
  }

  // עונים מהר ללקוח – אבל עוד לא שולחים עדכון לסקריפט
  res.json({ success: true, message: "✅ הקישור התקבל, מתחילים תהליך..." });

  try {
    if (ytdl.validateURL(url)) {
      // ▶️ הורדת וידאו מיוטיוב
      console.log("⏳ מזהה קישור YouTube:", url);
      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.replace(/[^\w\sא-ת-]/g, "_");

      const stream = ytdl.downloadFromInfo(info, { quality: "highest" });

      // 🔔 עדכון לסקריפט: התחלנו העלאה לדרייב
      await notifyScript({
        type: "upload-start",
        name: `${title}.mp4`,
        size: "לא ידוע מראש",
        source: "YouTube",
      });

      const uploadResponse = await drive.files.create({
        requestBody: {
          name: `${title}.mp4`,
          parents: [targetFolder],
        },
        media: {
          mimeType: "video/mp4",
          body: stream,
        },
        fields: "id, name",
        supportsAllDrives: true,
      });

      console.log("✅ הועלה בהצלחה:", uploadResponse.data);
      await notifyScript({ type: "upload-success", file: uploadResponse.data });
    } else {
      // ▶️ הורדת קובץ רגיל
      console.log("⏳ מזהה קובץ רגיל:", url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`שגיאה בהורדה: ${response.statusText}`);

      const buffer = await response.buffer();
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

      // חילוץ שם הקובץ המקורי מה־URL
      const urlParts = url.split("/");
      const originalName = decodeURIComponent(urlParts[urlParts.length - 1]);

      const stream = Readable.from(buffer);

      // 🔔 עדכון לסקריפט: התחלנו העלאה
      await notifyScript({
        type: "upload-start",
        name: originalName,
        size: `${sizeMB} MB`,
        source: "direct-link",
      });

      const uploadResponse = await drive.files.create({
        requestBody: {
          name: originalName,
          parents: [targetFolder],
        },
        media: {
          mimeType: response.headers.get("content-type") || "application/octet-stream",
          body: stream,
        },
        fields: "id, name",
        supportsAllDrives: true,
      });

      console.log("✅ הועלה בהצלחה:", uploadResponse.data);
      await notifyScript({ type: "upload-success", file: uploadResponse.data });
    }
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    await notifyScript({ type: "error", error: err.message });
  } finally {
    console.log("🎉 התהליך הסתיים.");
  }
});

// מאזינים לשרת
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
