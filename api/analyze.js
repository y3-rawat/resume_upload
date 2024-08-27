const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { job_description, additional_information, experience, extractedText, api } = req.body;

    try {
      const externalApiUrl = `https://resume-test-api.vercel.app/submit`;
      const apiResponse = await axios.post(externalApiUrl, {
        job_description,
        additional_information,
        experience,
        extractedText,
        api
      });

      res.json({
        success: true,
        apiResponse: apiResponse.data
      });
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({
        success: false,
        message: 'Error analyzing resume',
        error: error.message
      });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};