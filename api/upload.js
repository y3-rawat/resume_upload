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
      let job_description = '';
      let additional_information = '';
      let experience = '';
      let api = '';

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
        if (fieldname === 'job_description') {
          job_description = val;
        } else if (fieldname === 'additional_information') {
          additional_information = val;
        } else if (fieldname === 'experience') {
          experience = val;
        } else if (fieldname === 'api') {
          api = val;
        }
        formData[fieldname] = val;
      });

      busboy.on('finish', async () => {
        if (!fileBuffer) {
          console.error("No file received");
          res.status(400).json({ success: false, message: 'No file uploaded' });
          return resolve();
        }

        let extractedText = '';
        try {
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text || '';
        } catch (pdfError) {
          console.error("Error parsing PDF:", pdfError.message);
          extractedText = 'Error extracting text from PDF';
        }

        try {
          const externalApiUrl = `https://resume-test-api.vercel.app/submit?fileName=${encodeURIComponent(fileName)}&fileType=${encodeURIComponent(fileType)}&job_description=${encodeURIComponent(job_description)}&additional_information=${encodeURIComponent(additional_information)}&experience=${encodeURIComponent(experience)}&ext-text=${encodeURIComponent(extractedText)}&api=${encodeURIComponent(api)}`;
          const apiResponse = await axios.post(externalApiUrl, {
            fileName: fileName,
            fileType: fileType,
            job_description: job_description,
            additional_information: additional_information,
            experience: experience,
            extractedText: extractedText,
            api: api
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
    console.log("Method not allowed:", req.method);
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};