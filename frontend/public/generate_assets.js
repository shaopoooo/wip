const fs = require('fs');

// 1x1 transparent PNG base64
const iconBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
const buffer = Buffer.from(iconBase64, 'base64');
fs.writeFileSync('icon-192.png', buffer);
fs.writeFileSync('icon-512.png', buffer);

// Simple base64 for a dummy mp3/wav sound for error (just to have the file)
const errorSound = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="; // empty wav
fs.writeFileSync('error.wav', Buffer.from(errorSound, 'base64'));

console.log("Assets generated");
