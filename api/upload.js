const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

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

                const uri = process.env.MONGODB_URI;
                console.log("Attempting to connect to MongoDB...");
                const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

                try {
                    await client.connect();
                    console.log("Connected to MongoDB");
                    const database = client.db('db');
                    const collection = database.collection('items');

                    // Extract text from the PDF
                    const pdfData = await pdfParse(fileBuffer);
                    const extractedText = pdfData.text || '';

                    console.log("Inserting document into MongoDB...");
                    const result = await collection.insertOne({
                        filename: fileName,
                        filetype: fileType,
                        filedata: new Binary(fileBuffer),
                        extractedText: extractedText,
                        job_description: job_description,
                        additional_information: additional_information,
                        experience: experience,
                        formData: formData // Save form data as well
                    });

                    console.log("File successfully uploaded to MongoDB", result);

                    // Call the external API
                    const externalApiUrl = `https://resume-test-api.vercel.app/submit?fileName=${encodeURIComponent(fileName)}&fileType=${encodeURIComponent(fileType)}&job_description=${encodeURIComponent(job_description)}&additional_information=${encodeURIComponent(additional_information)}&experience=${encodeURIComponent(experience)}`;

                    try {
                        const apiResponse = await axios.get(externalApiUrl);
                        console.log("External API response:", apiResponse.data);
                        res.status(200).json({ success: true, extractedText: extractedText, apiResponse: apiResponse.data });
                    } catch (apiError) {
                        console.error("Error calling external API:", apiError);
                        res.status(500).json({ success: false, message: 'Failed to call external API', error: apiError.message });
                    }
                } catch (error) {
                    console.error("Error uploading file to MongoDB:", error);
                    res.status(500).json({ success: false, message: 'Failed to save to database', error: error.message });
                } finally {
                    await client.close();
                    console.log("MongoDB connection closed");
                    resolve();
                }
            });

            busboy.on('error', (error) => {
                console.error("Busboy error:", error);
                res.status(500).json({ success: false, message: 'File processing error', error: error.message });
                resolve();
            });

            req.pipe(busboy);
        });
    } else {
        // Method not allowed for other HTTP methods
        console.log("Method not allowed:", req.method);
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
};
