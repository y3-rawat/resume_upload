const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Use a proper queue service in production (e.g., AWS SQS, RabbitMQ)
const taskQueue = [];

const MONGODB_URI = process.env.MONGODB_URI;
const EXTERNAL_API_URL = 'https://resume-test-api.vercel.app/submit';

module.exports = async (req, res) => {
  console.log("Handler started, method:", req.method);

  // Enable CORS
  await new Promise((resolve, reject) => {
    cors()(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });

  if (req.method === 'POST') {
    return handleFileUpload(req, res);
  } else if (req.method === 'GET' && req.query.taskId) {
    return getTaskStatus(req, res);
  } else {
    console.log("Method not allowed:", req.method);
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};

async function handleFileUpload(req, res) {
  return new Promise((resolve) => {
    const busboy = Busboy({ headers: req.headers });
    const fileData = { fileBuffer: null, fileName: '', fileType: '' };
    const formData = {};

    busboy.on('file', (fieldname, file, { filename, mimeType }) => {
      console.log(`Uploading: ${filename}, MIME type: ${mimeType}`);
      fileData.fileName = filename;
      fileData.fileType = mimeType;
      const chunks = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        fileData.fileBuffer = Buffer.concat(chunks);
        console.log(`File upload complete. Size: ${fileData.fileBuffer.length} bytes`);
      });
    });

    busboy.on('field', (fieldname, val) => {
      console.log(`Field [${fieldname}]: value: ${val}`);
      formData[fieldname] = val;
    });

    busboy.on('finish', async () => {
      if (!fileData.fileBuffer) {
        console.error("No file received");
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return resolve();
      }

      const taskId = uuidv4();
      taskQueue.push({
        id: taskId,
        data: { ...fileData, ...formData }
      });

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
}

async function processTask(taskId) {
  const task = taskQueue.find(t => t.id === taskId);
  if (!task) {
    console.error(`Task ${taskId} not found`);
    return;
  }

  const { fileBuffer, fileName, fileType, job_description, additional_information, experience } = task.data;

  try {
    const extractedText = await extractTextFromPDF(fileBuffer);
    const apiResponse = await callExternalAPI(fileName, fileType, job_description, additional_information, experience, extractedText);
    await storeInMongoDB(task.data, extractedText, apiResponse);
    await updateTaskStatus(taskId, 'completed', apiResponse);
  } catch (error) {
    console.error("Error processing task:", error);
    await updateTaskStatus(taskId, 'failed', { error: error.message });
  }
}

async function extractTextFromPDF(fileBuffer) {
  try {
    const pdfData = await pdfParse(fileBuffer);
    return pdfData.text || '';
  } catch (pdfError) {
    console.error("Error parsing PDF:", pdfError.message);
    return 'Error extracting text from PDF';
  }
}

async function callExternalAPI(fileName, fileType, job_description, additional_information, experience, extractedText) {
  const params = new URLSearchParams({
    fileName, fileType, job_description, additional_information, experience,
    'ext-text': extractedText
  });
  const url = `${EXTERNAL_API_URL}?${params.toString()}`;
  const response = await axios.post(url, {
    fileName, fileType, job_description, additional_information, experience, extractedText
  });
  console.log("External API response:", response.data);
  return response.data;
}

async function storeInMongoDB(taskData, extractedText, apiResponse) {
  if (!MONGODB_URI) throw new Error('MONGODB_URI not configured');

  const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB");
    const collection = client.db('db').collection('items');

    await collection.insertOne({
      filename: taskData.fileName,
      filetype: taskData.fileType,
      filedata: new Binary(taskData.fileBuffer),
      extractedText,
      job_description: taskData.job_description,
      additional_information: taskData.additional_information,
      experience: taskData.experience,
      apiResponse
    });

    console.log("Data successfully uploaded to MongoDB");
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

async function getTaskStatus(req, res) {
  const taskId = req.query.taskId;
  const task = taskQueue.find(t => t.id === taskId);
  
  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found' });
  }

  return res.status(200).json({
    success: true,
    status: task.status || 'processing',
    result: task.result
  });
}

async function updateTaskStatus(taskId, status, result) {
  const taskIndex = taskQueue.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    taskQueue[taskIndex].status = status;
    taskQueue[taskIndex].result = result;
  }
  console.log(`Task ${taskId} ${status}`);
  // In a production environment, you would update the status in a persistent store
}