import express from "express";
import bodyParser from "body-parser";
import { google } from "googleapis";
import fetch from "node-fetch";

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

    const buffer = await response.buffer();

    const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    console.log("📤 מעלה ל-Drive...");
    const fileMetadata = {
      name: "file_" + Date.now(),
      parents: [targetFolder],
    };

    const media = {
      mimeType: response.headers.get("content-type") || "application/octet-stream",
      body: Buffer.from(buffer),
    };

    const uploadResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });

    console.log("✅ הועלה בהצלחה, File ID:", uploadResponse.data.id);
  } catch (err) {
    console.error("❌ שגיאה בתהליך:", err.message);
  }
});

// מאזינים לשרת
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
