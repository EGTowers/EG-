const express = require("express");
const { google } = require("googleapis");
const fetch = require("node-fetch");
const ytdl = require("ytdl-core");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// חיבור ל-Google Drive עם המפתח
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

app.use(express.json());

// דף בית
app.get("/", (req, res) => {
  res.send("🎉 השרת פעיל! שלח /upload עם קישור בקוורי (?url=) או POST JSON {url: ...}");
});

// פונקציה שמבצעת את ההעלאה בפועל
async function handleUpload(fileUrl, res) {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!fileUrl) {
    console.error("❌ לא התקבל פרמטר url");
    return res.status(400).send("❌ חסר פרמטר url");
  }

  try {
    console.log("🔗 קישור שהתקבל:", fileUrl);

    let stream;
    let fileName;

    if (ytdl.validateURL(fileUrl)) {
      console.log("📺 זוהה כקישור YouTube");
      const info = await ytdl.getInfo(fileUrl);
      fileName = (info.videoDetails.title || "youtube-video") + ".mp4";
      console.log("📁 שם הקובץ שייוצר בדרייב:", fileName);
      stream = ytdl(fileUrl, { quality: "highest" });
    } else {
      console.log("🌐 זוהה כקישור הורדה רגיל");
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("שגיאה בהורדה מהקישור: " + fileUrl);
      fileName = fileUrl.split("/").pop() || "file.bin";
      console.log("📁 שם הקובץ שייוצר בדרייב:", fileName);
      stream = response.body;
    }

    console.log("⬆️ מתחיל העלאה ל-Drive...");
    const fileMetadata = { name: fileName, parents: [folderId] };
    const media = { body: stream };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name",
    });

    console.log("✅ הסתיים בהצלחה:", uploadRes.data);
    res.send(`✅ הועלה לדרייב: ${uploadRes.data.name} (ID: ${uploadRes.data.id})`);
  } catch (err) {
    console.error("❌ שגיאה בטיפול:", err);
    res.status(500).send("❌ שגיאה בהעלאה לדרייב");
  }
}

// ראוט GET
app.get("/upload", (req, res) => handleUpload(req.query.url, res));

// ראוט POST
app.post("/upload", (req, res) => handleUpload(req.body.url, res));

// הרצת השרת
app.listen(PORT, () => console.log(`🚀 השרת רץ על פורט ${PORT}`));
