import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch"; // להורדת קבצים מהאינטרנט
import fs from "fs";
import { google } from "googleapis";
import ytdl from "ytdl-core";

const app = express();
app.use(bodyParser.json());

// --- הגדרות גוגל דרייב ---
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json", // הקובץ שלך עם המפתח
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// נתיב ראשי לבדיקה
app.get("/", (req, res) => {
  res.send("✅ השרת פעיל ומחכה לבקשות!");
});

// נתיב להעלאת קובץ מקישור
app.post("/upload", async (req, res) => {
  try {
    const { fileUrl, folderId } = req.body;

    if (!fileUrl || !folderId) {
      return res.status(400).json({ error: "חסר fileUrl או folderId" });
    }

    console.log("📥 מתחיל הורדה:", fileUrl);

    // הורדת הקובץ לשרת זמני
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`נכשל להוריד את הקובץ: ${response.statusText}`);
    }

    const tempPath = "./tempfile";
    const fileStream = fs.createWriteStream(tempPath);
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on("error", reject);
      fileStream.on("finish", resolve);
    });

    console.log("⬆️ מעלה ל־Google Drive...");

    const fileMetadata = {
      name: "uploaded_file",
      parents: [folderId],
    };
    const media = {
      body: fs.createReadStream(tempPath),
    };

    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id, name",
    });

    fs.unlinkSync(tempPath); // מחיקה אחרי סיום

    console.log("✅ הועלה בהצלחה לדרייב:", driveResponse.data);
    res.json({ success: true, file: driveResponse.data });
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// נתיב מיוחד להורדת סרטון יוטיוב לדרייב
app.post("/youtube", async (req, res) => {
  try {
    const { youtubeUrl, folderId } = req.body;

    if (!youtubeUrl || !folderId) {
      return res.status(400).json({ error: "חסר youtubeUrl או folderId" });
    }

    console.log("📥 מתחיל הורדה מיוטיוב:", youtubeUrl);

    const tempPath = "./video.mp4";
    const videoStream = ytdl(youtubeUrl, { quality: "highest" });
    const fileStream = fs.createWriteStream(tempPath);
    videoStream.pipe(fileStream);

    await new Promise((resolve, reject) => {
      videoStream.on("end", resolve);
      videoStream.on("error", reject);
    });

    console.log("⬆️ מעלה את הסרטון לדרייב...");

    const fileMetadata = {
      name: "youtube_video.mp4",
      parents: [folderId],
    };
    const media = {
      body: fs.createReadStream(tempPath),
    };

    const driveResponse = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id, name",
    });

    fs.unlinkSync(tempPath);

    console.log("✅ סרטון הועלה:", driveResponse.data);
    res.json({ success: true, file: driveResponse.data });
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
