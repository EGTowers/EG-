import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import ytdl from "@distube/ytdl-core";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// ----------------- הגדרות נתיבים -----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(__dirname, "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// ----------------- חיבור לגוגל דרייב -----------------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// ----------------- פונקציה להעלאה לדרייב -----------------
async function uploadToDrive(filePath, fileName) {
  const fileMetadata = {
    name: fileName,
    parents: [GOOGLE_DRIVE_FOLDER_ID],
  };
  const media = {
    body: fs.createReadStream(filePath),
  };
  const response = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: "id, name, size",
  });
  return response.data;
}

// ----------------- פונקציה להורדה -----------------
async function handleDownload(url, res) {
  try {
    console.log("⏳ מזהה קישור:", url);

    // האם זה יוטיוב?
    const isYouTube =
      url.includes("youtube.com") || url.includes("youtu.be");

    // יצירת שם זמני
    const timestamp = Date.now();
    const tmpFilePath = path.join(TMP_DIR, `${timestamp}.tmp`);

    if (isYouTube) {
      console.log("⬇️ הורדת YouTube...");
      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.replace(/[^\w\s]/gi, "_");
      const filePath = path.join(TMP_DIR, `${title}.mp4`);

      await new Promise((resolve, reject) => {
        ytdl(url, { quality: "highest" })
          .pipe(fs.createWriteStream(filePath))
          .on("finish", resolve)
          .on("error", reject);
      });

      const uploaded = await uploadToDrive(filePath, `${title}.mp4`);
      fs.unlinkSync(filePath);

      return res.json({ success: true, uploaded });
    } else {
      console.log("⬇️ הורדה רגילה...");
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error("שגיאה בהורדה: " + response.statusText);
      }

      const fileName =
        path.basename(new URL(url).pathname) || `file-${timestamp}`;
      const filePath = path.join(TMP_DIR, fileName);

      const fileStream = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
      });

      const uploaded = await uploadToDrive(filePath, fileName);
      fs.unlinkSync(filePath);

      return res.json({ success: true, uploaded });
    }
  } catch (err) {
    console.error("❌ שגיאה:", err.message);
    return res
      .status(500)
      .json({ success: false, error: err.message });
  }
}

// ----------------- GET /download -----------------
app.get("/download", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: "חסר פרמטר url" });
  }
  await handleDownload(url, res);
});

// ----------------- POST /upload -----------------
app.post("/upload", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: "חסר פרמטר url" });
  }
  await handleDownload(url, res);
});

// ----------------- הפעלת שרת -----------------
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
