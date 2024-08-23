const { MongoClient, Binary } = require('mongodb');
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

        try {
          // Extract text from PDF
          const pdfData = await pdfParse(fileBuffer);
          const extractedText = pdfData.text || '';

          // Call external API
          const externalApiUrl = `https://resume-test-api.vercel.app/submit`;
          const apiResponse = await axios.post(externalApiUrl, {
            fileName: fileName,
            fileType: fileType,
            job_description: job_description,
            additional_information: additional_information,
            experience: experience,
            extractedText: extractedText,
            api: api
          });

          // Insert data into MongoDB
          await insertIntoMongoDB({
            fileName,
            fileType,
            fileBuffer,
            extractedText,
            job_description,
            additional_information,
            experience,
            formData,
            apiResponse: apiResponse.data
          });

          // Redirect to result page
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

async function insertIntoMongoDB(data) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Server configuration error');
  }

  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const database = client.db('db');
    const collection = database.collection('items');

    await collection.insertOne({
      filename: data.fileName,
      filetype: data.fileType,
      filedata: new Binary(data.fileBuffer),
      extractedText: data.extractedText,
      job_description: data.job_description,
      additional_information: data.additional_information,
      experience: data.experience,
      formData: data.formData,
      apiResponse: data.apiResponse
    });

    console.log("File and API response successfully uploaded to MongoDB");
  } catch (error) {
    console.error("Error inserting data into MongoDB:", error);
  } finally {
    await client.close();
  }
}