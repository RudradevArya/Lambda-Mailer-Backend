const express = require('express');
const multer = require('multer'); // Middleware for handling file uploads
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
// const sqs = new AWS.SQS();
const cors = require('cors');
const csv = require('csv-parser');

const app = express();
// const upload = multer({ dest: 'uploads/' }); // Temporary directory for uploaded files
const upload = multer({ storage: multer.memoryStorage() });

// Set the region 
AWS.config.update({region: 'ap-south-1'}); 

// Enable CORS for the API
app.use(cors());


// API endpoint to handle file upload and enqueue email sending task
app.post('/api/send-emails', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.log('No file uploaded.');
      return res.status(400).send('No file uploaded.');
    }
    const emailTemplate = req.body.emailTemplate; //exract email tempplate from request body from fornt end

    console.log('Uploaded file:', req.file);

    const fileContent = req.file.buffer;
    console.log('File content:', fileContent);

    const s3Params = {
      Bucket: 'demo-lambda-mailer',
      Key: `uploads/${req.file.originalname}`,
      Body: fileContent,
    };
    console.log('S3 upload params:', s3Params);
    
    try {
      const s3Response = await s3.upload(s3Params).promise();
      console.log('S3 upload response:', s3Response);
    } catch (err) {
      console.log("Error uploading file:", err);
    }

    
    const fileStream = s3.getObject({ Bucket: s3Params.Bucket, Key: s3Params.Key }).createReadStream();
    const ses = new AWS.SES();

    fileStream
      .pipe(csv())
      .on('data', async (data) => {
        try {
          console.log('CSV data:', data);

          // const { email } = data;
          if (!data.Email || data.Email.trim() === '') {
            console.log('Skipping row with missing or empty email:', data);
            return;
          }
          
          let message = req.body.customMessage;

          // let personalizedTemplate = emailTemplate;
          for (const column in data) {
            const placeholder = `${column}`;
            const value = data[column];
            // personalizedTemplate = personalizedTemplate.replace(placeholder, value);
            message = message.replace(new RegExp(placeholder, 'g'), value);
          }
          // const { email, name } = data;


          const emailParams = {
            Destination: {
              ToAddresses: [data.Email],
            },
            Message: {
              Body: {
                Text: {
                  // Data: `${req.body.customMessage}\n\nRegards,\nYour App`,
                  // Data: personalizedTemplate,
                  Data: `${message}\n\nRegards,\nSent Through Lambda Mailer`,
                },
              },
              Subject: {
                Data: 'Greeting Topprzzz!!',
              },
            },
            Source: 'fringe.xb6783746@gmail.com',
          };
          console.log('Email params:', emailParams);

          await ses.sendEmail(emailParams).promise();
          console.log('Email sent successfully');
        } catch (error) {
          console.error('Error sending email:', error);
        }
      })
      .on('end', () => {
        console.log('Email sending process completed!');
        res.status(200).send('Emails sent successfully!');
      });
    } catch (error) {
      console.error('Error:', error);
      console.error('Error stack trace:', error.stack);
      res.status(500).send('Error sending emails: ' + error.message);
    }
  });

module.exports = app;