const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const missingCloudinaryConfig = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
].filter(name => !process.env[name]);

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'gov-documents',
        resource_type: 'raw',
        public_id: (req, file) => 'doc-' + Date.now() + '.pdf' //
    },
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const dataFilePath = path.join(dataDir, 'database.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

function readData() {
    if (!fs.existsSync(dataFilePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    } catch (err) {
        return [];
    }
}

function writeData(data) {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
}

// API ดึงข้อมูล
app.get('/api/documents', (req, res) => {
    res.json(readData());
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        cloudinaryConfigured: missingCloudinaryConfig.length === 0
    });
});
// API เพิ่มเอกสาร
app.post('/api/documents', upload.single('file'), (req, res) => {
    try {
        const { docNumber, title, department, date } = req.body;
        const filePath = req.file ? req.file.path : '';

        const docs = readData();
        const newDoc = {
            id: Date.now().toString(),
            docNumber,
            title,
            department,
            date,
            filePath,
            createdAt: new Date().toISOString()
        };

        docs.unshift(newDoc);
        writeData(docs);

        res.json({ success: true, message: 'บันทึกเอกสารสำเร็จ', data: newDoc });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// API แก้ไขข้อมูลเอกสาร
app.put('/api/documents/:id', upload.single('file'), (req, res) => {
    try {
        let docs = readData();
        const docIndex = docs.findIndex(d => d.id === req.params.id);

        if (docIndex === -1) {
            return res.status(404).json({ success: false, message: 'ไม่พบเอกสารที่ต้องการแก้ไข' });
        }

        const { docNumber, title, department, date } = req.body;
        const filePath = req.file ? req.file.path : docs[docIndex].filePath;

        docs[docIndex] = {
            ...docs[docIndex],
            docNumber: docNumber || docs[docIndex].docNumber,
            title: title || docs[docIndex].title,
            department: department || docs[docIndex].department,
            date: date || docs[docIndex].date,
            filePath: filePath
        };

        writeData(docs);
        res.json({ success: true, message: 'แก้ไขข้อมูลเอกสารสำเร็จ', data: docs[docIndex] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// API ลบเอกสาร
app.delete('/api/documents/:id', (req, res) => {
    let docs = readData();
    const docIndex = docs.findIndex(d => d.id === req.params.id);
    
    if (docIndex === -1) {
        return res.status(404).json({ success: false, message: 'ไม่พบเอกสารนี้' });
    }

    docs.splice(docIndex, 1);
    writeData(docs);

    res.json({ success: true, message: 'ลบเอกสารเรียบร้อยแล้ว' });
});

// ตัวจัดการข้อผิดพลาดจาก Multer
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof multer.MulterError 
        ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400) 
        : 500;
    res.status(status).json({
        success: false,
        message: missingCloudinaryConfig.length > 0 && req.file === undefined
            ? 'ยังไม่ได้ตั้งค่า Cloudinary ใน Environment Variables'
            : (error.message || 'เกิดข้อผิดพลาดในการประมวลผลคำขอ')
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});