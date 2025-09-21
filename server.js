import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import ytdl from "@distube/ytdl-core";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

// === הגדרות גוגל דרייב ===
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/drive"]
});
const drive = google.drive({ version: "v3", auth });

// === אחסון זמני ===
const upload = multer({ dest: "uploads/" });

// === עוזר להעלאת קובץ לדרייב ===
async function uploadToDrive(filePath, originalName, folderId) {
  const fileMetadata = {
    name: originalName,
    parents: folderId ? [folderId] : []
  };

  const media = {
    body: fs.createReadStream(filePath)
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: "id, name, size"
  });

  return res.data;
}

// === הורדה מיוטיוב והעלאה לדרייב ===
app.post("/upload", async (req, res) => {
  try {
    const { url, folderId } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "Missing URL" });
    }

    if (ytdl.validateURL(url)) {
      console.log("📥 מתחיל הורדה מיוטיוב:", url);

      const info = await ytdl.getInfo(url);
      const format = ytdl.chooseFormat(info.formats, { quality: "highestvideo" });
      const ext = format.container || "mp4";

      const uniqueId = uuidv4();
      const fileName = `${info.videoDetails.title.replace(/[^\w\s.-]/g, "_")}.${ext}`;
      const filePath = path.resolve(`downloads/${uniqueId}-${fileName}`);

      // הורדה
      await new Promise((resolve, reject) => {
        ytdl.downloadFromInfo(info, { format })
          .pipe(fs.createWriteStream(filePath))
          .on("finish", resolve)
          .on("error", reject);
      });

      console.log("⬆️ מעלה לדרייב:", fileName);

      const uploaded = await uploadToDrive(filePath, fileName, folderId);

      fs.unlinkSync(filePath); // ניקוי

      return res.json({ success: true, file: uploaded });
    }

    return res.status(400).json({ success: false, error: "URL לא תקין ל־YouTube" });

  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

