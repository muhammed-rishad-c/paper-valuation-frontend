// src/services/multerSetup.js
const multer = require('multer');

// Configure Multer to save files to the 'uploads' directory
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // cb(error, destination_folder)
        cb(null, 'uploads/'); 
    },
    filename: (req, file, cb) => {
        // cb(error, file_name) - creates a unique filename
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB (optional)
    fileFilter: (req, file, cb) => {
        // Accept only JPEG and PNG files
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'), false);
        }
    }
});

module.exports = { upload };