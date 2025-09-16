const express = require("express");
const { google } = require("googleapis");
const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// חיבור ל-Google Drive עם המפתח
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
const drive = google.drive({ version: "v3", auth });

// דף בית
app.get("/", (req, res) => {
  res.send("🎉 השרת פעיל! שלח קישור ל־/upload?url=... להעלאה ל-Drive");
});

// ראוט להעלאה
app.get("/upload", async (req, res) => {
  const fileUrl = req.query.url;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!fileUrl) return res.status(400).send("❌ חסר פרמטר url");

  try {
    // הורדה כ-Stream
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("שגיאה בהורדה");

    const fileName = fileUrl.split("/").pop() || "file.bin";
    const fileMetadata = { name: fileName, parents: [folderId] };

    const media = { body: response.body };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name",
    });

    res.send(`✅ הועלה לדרייב: ${uploadRes.data.name} (ID: ${uploadRes.data.id})`);
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ שגיאה בהעלאה לדרייב");
  }
});

// הרצת השרת
app.listen(PORT, () => console.log(`🚀 השרת רץ על פורט ${PORT}`));
