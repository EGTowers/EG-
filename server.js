import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import ytdl from "@distube/ytdl-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json());

// === Google Drive Auth ===
const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT;
if (!serviceAccount) {
  throw new Error("❌ חסר משתנה GOOGLE_SERVICE_ACCOUNT בסביבה!");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(serviceAccount),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// === פונקציה להורדה מיוטיוב ===
async function downloadYouTube(url, dest) {
  return new Promise((resolve, reject) => {
    const stream = ytdl(url, { quality: "highest" })
      .pipe(fs.createWriteStream(dest));
    stream.on("finish", () => resolve(dest));
    stream.on("error", reject);
  });
}

// === פונקציה להורדה רגילה עם User-Agent ===
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

  const buffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  return dest;
}

// === פונקציה להעלאה לדרייב ===
async function uploadToDrive(filePath, fileName) {
  const fileMetadata = {
    name: fileName,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
  };
  const media = {
    mimeType: "application/octet-stream",
    body: fs.createReadStream(filePath),
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: "id, name, size",
    supportsAllDrives: true,
  });

  return file.data;
}

// === נקודת API ראשית ===
app.post("/upload", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: "לא סופק קישור" });
    }

    console.log(`⏳ מתחיל הורדה: ${url}`);

    const ext =
      url.includes("youtube.com") || url.includes("youtu.be")
        ? ".mp4"
        : path.extname(url) || ".bin";
    const fileName = `download_${Date.now()}${ext}`;
    const tempPath = path.join(__dirname, fileName);

    // הורדה
    if (ytdl.validateURL(url)) {
      await downloadYouTube(url, tempPath);
    } else {
      await downloadFile(url, tempPath);
    }

    // העלאה לדרייב
    const uploaded = await uploadToDrive(tempPath, fileName);

    console.log(`✅ הועלה לדרייב: ${uploaded.name} (${uploaded.size} bytes)`);

    // מחיקה אחרי העלאה
    fs.unlinkSync(tempPath);

    return res.json({
      success: true,
      file: uploaded,
    });
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// === הפעלה ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
