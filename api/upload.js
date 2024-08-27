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

          console.log("Sending request to external API");
          const externalApiUrl = `https://resume-test-api.vercel.app/submit`;
          const apiResponse = await axios.post(externalApiUrl, {
            fileName: fileName,
            fileType: fileType,
            job_description: formData.job_description,
            additional_information: formData.additional_information,
            experience: formData.experience,
            extractedText: extractedText,
            api: formData.api
          });
          console.log("External API response received");

          const safeExtractedText = safeEncodeURIComponent(extractedText);
          const safeApiResponse = safeEncodeURIComponent(JSON.stringify(apiResponse.data));
          const safeSpecialChars = safeEncodeURIComponent(specialChars);
          
          const redirectUrl = `/result.html?success=true&extractedText=${safeExtractedText}&apiResponse=${safeApiResponse}&specialChars=${safeSpecialChars}`;

          res.writeHead(302, { Location: redirectUrl });
          res.end();
        } catch (error) {
          console.error("Error processing request:", error);
          const errorDetails = {
            message: error.message,
            stack: error.stack,
            response: error.response ? {
              status: error.response.status,
              data: error.response.data
            } : null
          };
          const safeErrorDetails = safeEncodeURIComponent(JSON.stringify(errorDetails));
          const redirectUrl = `/result.html?success=false&errorDetails=${safeErrorDetails}`;
          res.writeHead(302, { Location: redirectUrl });
          res.end();
        }

        resolve();
      });

      busboy.on('error', (error) => {
        console.error("Busboy error:", error);
        const errorDetails = {
          message: error.message,
          stack: error.stack
        };
        const safeErrorDetails = safeEncodeURIComponent(JSON.stringify(errorDetails));
        const redirectUrl = `/result.html?success=false&errorDetails=${safeErrorDetails}`;
        res.writeHead(302, { Location: redirectUrl });
        res.end();
        resolve();
      });

      req.pipe(busboy);
    });
  } else {
    // Method not allowed for other HTTP methods
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};