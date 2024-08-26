const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

const safeEncodeURIComponent = (str) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
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
          res.status(400).json({ success: false, message: 'No file uploaded' });
          return resolve();
        }

        try {
          const pdfData = await pdfParse(fileBuffer);
          const extractedText = pdfData.text || '';
          
          // Here, you would typically send the extracted text along with other form data to your analysis API
          // For this example, we'll just send back the extracted text
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

          const safeExtractedText = safeEncodeURIComponent(extractedText);
          const safeApiResponse = safeEncodeURIComponent(JSON.stringify(apiResponse.data));
          const redirectUrl = `/result.html?success=true&extractedText=${safeExtractedText}&apiResponse=${safeApiResponse}`;

          res.writeHead(302, { Location: redirectUrl });
          res.end();
        } catch (error) {
          console.error("Error processing request:", error);
          const safeErrorMessage = safeEncodeURIComponent(error.message);
          const redirectUrl = `/result.html?success=false&errorMessage=${safeErrorMessage}`;
          res.writeHead(302, { Location: redirectUrl });
          res.end();
        }

        resolve();
      });

      busboy.on('error', (error) => {
        console.error("Busboy error:", error.message);
        const redirectUrl = `/result.html?success=false&errorMessage=${encodeURIComponent(error.message)}`;
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