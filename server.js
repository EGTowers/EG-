import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";
import { Readable } from "stream";
import path from "path";

const app = express();
app.use(bodyParser.json());

// טוענים את ההרשאות מתוך משתנה הסביבה
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});

const drive = google.drive({ version: "v3", auth });

// נקודת קצה להעלאה
app.post("/upload", async (req, res) => {
  const { url, folderId } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "חסר קישור להורדה" });
  }

  // מחזירים תגובה מיידית ללקוח
  res.json({ success: true, message: "✅ הקישור התקבל, מתחילים בתהליך..." });

  try {
    console.log("⏳ מוריד קובץ:", url);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`שגיאה בהורדה: ${response.statusText}`);

    // שם קובץ מה-URL או ברירת מחדל
    let fileName = path.basename(new URL(url).pathname) || "file_" + Date.now();
    if (!fileName || fileName.trim() === "") fileName = "file_" + Date.now();

    const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    // קביעת מצב לפי גודל
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    const isSmallFile = contentLength > 0 && contentLength < 20 * 1024 * 1024; // פחות מ-20MB

    console.log(`📏 גודל קובץ: ${contentLength} bytes (${isSmallFile ? "קטן - buffer" : "גדול - stream"})`);

    let media;
    if (isSmallFile) {
      // טעינה מלאה לזיכרון
      const buffer = await response.arrayBuffer();
      media = {
        mimeType: response.headers.get("content-type") || "application/octet-stream",
        body: Buffer.from(buffer),
      };
    } else {
      // הורדה כ-stream
      const stream = Readable.fromWeb(response.body);
      media = {
        mimeType: response.headers.get("content-type") || "application/octet-stream",
        body: stream,
      };
    }

    console.log("📤 מעלה ל-Drive...");
    const fileMetadata = {
      name: fileName,
      parents: [targetFolder],
    };

    const uploadResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name",
    });

    console.log("✅ הועלה בהצלחה:", uploadResponse.data);
  } catch (err) {
    console.error("❌ שגיאה בתהליך:", err.message);
  }
});

// מאזינים לשרת
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
