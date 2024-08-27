const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

const safeEncodeURIComponent = (str) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
};

const detectSpecialCharacters = (text) => {
  const specialChars = text.match(/[^a-zA-Z0-9\s]/g);
  return specialChars ? [...new Set(specialChars)].join('') : '';
};

module.exports = async (req, res) => {
  // Enable CORS
  await new Promise((resolve, reject) => {
    cors()(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });

  // Handle POST requests for file upload
  if (req.method === 'POST') {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      let fileBuffer = null;
      let fileName = '';
      let fileType = '';
      let formData = {};

      busboy.on('file', (fieldname, file, { filename, mimeType }) => {
        fileName = filename;
        fileType = mimeType;
        const chunks = [];
        file.on('data', (data) => {
          chunks.push(data);
        });
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      busboy.on('field', (fieldname, val) => {
        formData[fieldname] = val;
      });

      busboy.on('finish', async () => {
        if (!fileBuffer) {
          console.error("No file uploaded");
          res.status(400).json({ success: false, message: 'No file uploaded' });
          return resolve();
        }

        try {
          console.log("Starting PDF parsing");
          const pdfData = await pdfParse(fileBuffer);
          const extractedText = pdfData.text || '';
          console.log("PDF parsing completed. Extracted text length:", extractedText.length);

          const specialChars = detectSpecialCharacters(extractedText);
          console.log("Special characters detected:", specialChars);

          res.json({
            success: true,
            extractedText: extractedText,
            specialChars: specialChars
          });
        } catch (error) {
          console.error("Error processing request:", error);
          res.status(500).json({
            success: false,
            message: 'Error processing the file',
            error: error.message
          });
        }

        resolve();
      });

      busboy.on('error', (error) => {
        console.error("Busboy error:", error);
        res.status(500).json({
          success: false,
          message: 'Error processing the file',
          error: error.message
        });
        resolve();
      });

      req.pipe(busboy);
    });
  } else {
    // Method not allowed for other HTTP methods
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};