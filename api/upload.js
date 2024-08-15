const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const express = require('express');
const app = express();

app.use(cors()); // Apply CORS globally

const mongoClient = new MongoClient(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const safeEncodeURIComponent = (str) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
};

app.post('/upload', async (req, res) => {
  console.log("Handler started, method:", req.method);

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
      return;
    }

    try {
      let extractedText = '';
      try {
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text || '';
      } catch (pdfError) {
        console.error("Error parsing PDF:", pdfError.message);
        extractedText = 'Error extracting text from PDF';
      }

      const externalApiUrl = `https://c2c-ats-analyzer-api.vercel.app/submit?fileName=${safeEncodeURIComponent(fileName)}&fileType=${safeEncodeURIComponent(fileType)}&job_description=${safeEncodeURIComponent(job_description)}&additional_information=${safeEncodeURIComponent(additional_information)}&experience=${safeEncodeURIComponent(experience)}&ext-text=${safeEncodeURIComponent(extractedText)}`;

      let apiResponse;
      try {
        apiResponse = await axios.post(externalApiUrl, {
          fileName: fileName,
          fileType: fileType,
          job_description: job_description,
          additional_information: additional_information,
          experience: experience,
          extractedText: extractedText,
        });
      } catch (apiError) {
        console.error("Error calling external API:", apiError.message);
        throw new Error(`External API error: ${apiError.message}`);
      }

      console.log("External API response:", apiResponse.data);

      try {
        await mongoClient.connect();
        console.log("Connected to MongoDB");
        const database = mongoClient.db('db');
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
      } catch (mongoError) {
        console.error("MongoDB error:", mongoError.message);
        throw new Error(`MongoDB error: ${mongoError.message}`);
      } finally {
        await mongoClient.close();
        console.log("MongoDB connection closed");
      }

      const safeExtractedText = safeEncodeURIComponent(extractedText);
      const safeApiResponse = safeEncodeURIComponent(JSON.stringify(apiResponse.data));
      const redirectUrl = `/result.html?success=true&extractedText=${safeExtractedText}&apiResponse=${safeApiResponse}`;
      console.log("Redirect URL:", redirectUrl);

      res.redirect(302, redirectUrl);
    } catch (error) {
      console.error("Error processing request:", error);
      const safeErrorMessage = safeEncodeURIComponent(error.message);
      const redirectUrl = `/result.html?success=false&errorMessage=${safeErrorMessage}`;
      res.redirect(302, redirectUrl);
    }
  });

  busboy.on('error', (error) => {
    console.error("Busboy error:", error.message);
    const redirectUrl = `/result.html?success=false&errorMessage=${encodeURIComponent(error.message)}`;
    res.redirect(302, redirectUrl);
  });

  req.pipe(busboy);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
