import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { pipeline } from "stream";
import { promisify } from "util";
import fetch from "node-fetch";
import ytdl from "@distube/ytdl-core";

const streamPipeline = promisify(pipeline);
const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Google Drive Client ===
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// === הורדה רגילה (stream) ===
async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`שגיאה בהורדה: ${res.status} ${res.statusText}`);
  }

  await streamPipeline(res.body, fs.createWriteStream(dest));
  return dest;
}

// === הורדה מיוטיוב (stream) ===
async function downloadYouTube(url, dest) {
  const video = ytdl(url, { quality: "highest" });
  await streamPipeline(video, fs.createWriteStream(dest));
  return dest;
}

// === העלאה ל־Google Drive ===
async function uploadToDrive(filePath, fileName) {
  const fileMetadata = {
    name: fileName,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
  };
  const media = {
    body: fs.createReadStream(filePath),
  };

  const res = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: "id, webViewLink, webContentLink",
  });

  return res.data;
}

// === נקודת API ראשית ===
app.get("/download", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ success: false, error: "חסר פרמטר url" });
  }

  const tempFile = path.join(__dirname, `temp_${Date.now()}`);

  try {
    let filePath;
    let fileName;

    if (ytdl.validateURL(url)) {
      console.log("⏳ מזהה קישור YouTube:", url);
      fileName = `youtube_${Date.now()}.mp4`;
      filePath = await downloadYouTube(url, tempFile);
    } else {
      console.log("⏳ מזהה קישור רגיל:", url);
      fileName = path.basename(new URL(url).pathname) || `file_${Date.now()}`;
      filePath = await downloadFile(url, tempFile);
    }

    const driveFile = await uploadToDrive(filePath, fileName);

    fs.unlinkSync(filePath); // מנקה קובץ זמני

    res.json({
      success: true,
      fileId: driveFile.id,
      webViewLink: driveFile.webViewLink,
      webContentLink: driveFile.webContentLink,
    });
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 השרת רץ על פורט ${PORT}`);
});
