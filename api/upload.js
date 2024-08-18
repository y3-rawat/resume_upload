const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

// Simulated queue (replace with actual queue service like AWS SQS or RabbitMQ)
const taskQueue = [];

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

        // Generate a unique task ID
        const taskId = Date.now().toString();

        // Queue the task
        taskQueue.push({
          id: taskId,
          data: {
            fileBuffer,
            fileName,
            fileType,
            job_description,
            additional_information,
            experience,
            formData
          }
        });

        // Respond immediately with the task ID
        res.status(202).json({ success: true, message: 'Task queued', taskId });

        // Process the task asynchronously
        processTask(taskId);

        resolve();
      });

      busboy.on('error', (error) => {
        console.error("Busboy error:", error.message);
        res.status(500).json({ success: false, message: 'File upload error' });
        resolve();
      });

      req.pipe(busboy);
    });
  } else if (req.method === 'GET' && req.query.taskId) {
    // Handle GET requests to check task status
    const taskId = req.query.taskId;
    const taskStatus = await getTaskStatus(taskId);
    res.status(200).json(taskStatus);
  } else {
    // Method not allowed for other HTTP methods
    console.log("Method not allowed:", req.method);
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};

async function processTask(taskId) {
  const task = taskQueue.find(t => t.id === taskId);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    return;
  }

  const { fileBuffer, fileName, fileType, job_description, additional_information, experience, formData } = task.data;

  try {
    let extractedText = '';
    try {
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text || '';
    } catch (pdfError) {
      console.error("Error parsing PDF:", pdfError.message);
      extractedText = 'Error extracting text from PDF';
    }

    const externalApiUrl = `https://resume-test-api.vercel.app/submit?fileName=${encodeURIComponent(fileName)}&fileType=${encodeURIComponent(fileType)}&job_description=${encodeURIComponent(job_description)}&additional_information=${encodeURIComponent(additional_information)}&experience=${encodeURIComponent(experience)}&ext-text=${encodeURIComponent(extractedText)}`;
    const apiResponse = await axios.post(externalApiUrl, {
      fileName: fileName,
      fileType: fileType,
      job_description: job_description,
      additional_information: additional_information,
      experience: experience,
      extractedText: extractedText,
    });

    console.log("External API response:", apiResponse.data);

    // Store the result in MongoDB
    await storeInMongoDB(task.data, extractedText, apiResponse.data);

    // Update task status (implement this function based on your storage method)
    await updateTaskStatus(taskId, 'completed', apiResponse.data);
  } catch (error) {
    console.error("Error processing task:", error);
    await updateTaskStatus(taskId, 'failed', { error: error.message });
  }
}

async function storeInMongoDB(taskData, extractedText, apiResponse) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Server configuration error');
  }

  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB");
    const database = client.db('db');
    const collection = database.collection('items');

    await collection.insertOne({
      filename: taskData.fileName,
      filetype: taskData.fileType,
      filedata: new Binary(taskData.fileBuffer),
      extractedText: extractedText,
      job_description: taskData.job_description,
      additional_information: taskData.additional_information,
      experience: taskData.experience,
      formData: taskData.formData,
      apiResponse: apiResponse
    });

    console.log("File and API response successfully uploaded to MongoDB");
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

async function getTaskStatus(taskId) {
  // Implement this function to retrieve task status from your storage
  // For now, we'll return a mock status
  return { status: 'processing' };
}

async function updateTaskStatus(taskId, status, result) {
  // Implement this function to update task status in your storage
  console.log(`Task ${taskId} ${status}`);
}