const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

const safeEncodeURIComponent = (str) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
};

module.exports = async (req, res) => {
  console.log("Handler started, method:", req.method);

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
    console.log("Received POST request");

    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      let fileBuffer = null;
      let fileName = '';
      let fileType = '';
      let formData = {};
      let job_description = '';
      let additional_information = '';
      let experience = '';

      busboy.on('file', (fieldname, file, { filename, mimeType }) => {
        console.log(`Uploading: ${filename}, MIME type: ${mimeType}`);
        fileName = filename;
        fileType = mimeType;
        const chunks = [];
        file.on('data', (data) => {
          chunks.push(data);
        });
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
          console.log(`File upload complete. Size: ${fileBuffer.length} bytes`);
        });
      });

      busboy.on('field', (fieldname, val) => {
        console.log(`Field [${fieldname}]: value: ${val}`);
        if (fieldname === 'job_description') {
          job_description = val;
        } else if (fieldname === 'additional_information') {
          additional_information = val;
        } else if (fieldname === 'experience') {
          experience = val;
        }
        formData[fieldname] = val;
      });

      busboy.on('finish', async () => {
        if (!fileBuffer) {
          console.error("No file received");
          res.status(400).json({ success: false, message: 'No file uploaded' });
          return resolve();
        }

        try {
          // Extract text from the PDF
          let extractedText = '';
          try {
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text || '';
          } catch (pdfError) {
            console.error("Error parsing PDF:", pdfError.message);
            extractedText = 'Error extracting text from PDF';
          }

          // Call the external API first
          const externalApiUrl = `https://c2c-ats-analyzer-api.vercel.app/submit?fileName=${encodeURIComponent(fileName)}&fileType=${encodeURIComponent(fileType)}&job_description=${encodeURIComponent(job_description)}&additional_information=${encodeURIComponent(additional_information)}&experience=${encodeURIComponent(experience)}&ext-text=${encodeURIComponent(extractedText)}`;
          const apiResponse = await axios.post(externalApiUrl, {
            fileName: fileName,
            fileType: fileType,
            job_description: job_description,
            additional_information: additional_information,
            experience: experience,
            extractedText: extractedText,
          });

          console.log("External API response:", apiResponse.data);

          // Now, store the data in MongoDB
          const uri = process.env.MONGODB_URI;
          if (!uri) {
            console.error("MongoDB URI is not set");
            throw new Error('Server configuration error');
          }

          console.log("Attempting to connect to MongoDB...");
          const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

          await client.connect();
          console.log("Connected to MongoDB");
          const database = client.db('db');
          const collection = database.collection('items');

          console.log("Inserting document into MongoDB...");
          const result = await collection.insertOne({
            filename: fileName,
            filetype: fileType,
            filedata: new Binary(fileBuffer),
            extractedText: extractedText,
            job_description: job_description,
            additional_information: additional_information,
            experience: experience,
            formData: formData,
            apiResponse: apiResponse.data
          });

          console.log("File and API response successfully uploaded to MongoDB", result);

          await client.close();
          console.log("MongoDB connection closed");

          const safeExtractedText = safeEncodeURIComponent(extractedText);
          const safeApiResponse = safeEncodeURIComponent(JSON.stringify(apiResponse.data));
          const redirectUrl = `/result.html?success=true&extractedText=${safeExtractedText}&apiResponse=${safeApiResponse}`;
          console.log("Redirect URL:", redirectUrl);

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