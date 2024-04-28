const express = require('express');
const session = require('express-session');

require('dotenv').config();

// const crypto = require('crypto');
// const secretKey = crypto.randomBytes(32).toString('hex');

const multer = require('multer'); // Middleware for handling file uploads
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
// const sqs = new AWS.SQS();
const cors = require('cors');
const csv = require('csv-parser');

const { google } = require('googleapis');
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID, //client id
  process.env.GOOGLE_CLIENT_SECRET, //secret
  'http://localhost:3001/api/google-callback'
);

const app = express();
// const upload = multer({ dest: 'uploads/' }); // Temporary directory for uploaded files
const upload = multer({ storage: multer.memoryStorage() });

app.use(session({
  // secret: secretKey,
  // secret: process.env.SESSION_SECRET,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // Session expires after 24 hours
    secure: false, // Set to true if using HTTPS
  },
}));

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

// Set the region 
AWS.config.update({region: 'ap-south-1'}); 

app.get('/api/google-login', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/userinfo.email']
  });
  res.redirect(authUrl);
});

app.get('/api/google-callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get the user's email address
  const oauth2 = google.oauth2({
    auth: oauth2Client,
    version: 'v2'
  });
  const userInfo = await oauth2.userinfo.get();
  const userEmail = userInfo.data.email;

  req.session.userEmail = userEmail;
  console.log('Session after setting userEmail:', req.session);
  req.session.save(err => {
    if (err) {
      console.error('Error saving session:', err);
    }
  });

  console.log(req.session.userEmail);
  // Check if the email is already verified in SES and initiate verification if needed

  try {
    // Check if the email is already verified in SES
    const ses = new AWS.SES();
    const listIdentitiesParams = {
      IdentityType: 'EmailAddress',
      MaxItems: 1000
    };
    const listIdentitiesResponse = await ses.listIdentities(listIdentitiesParams).promise();
    const verifiedEmails = listIdentitiesResponse.Identities;

    if (!verifiedEmails.includes(userEmail)) {
      // Email is not verified, initiate the verification process
      const verifyEmailParams = {
        EmailAddress: userEmail
      };
      await ses.verifyEmailIdentity(verifyEmailParams).promise();
      console.log(`Verification email sent to ${userEmail}`);
    } else {
      console.log(`Email ${userEmail} is already verified`);
    }
  } catch (error) {
    console.error('Error verifying email:', error);
  }

  res.redirect('http://localhost:3000'); // Redirect back to the frontend
  
});


// Enable CORS for the API
// app.use(cors());

// app.get('/api/google-callback', async (req, res) => {
  
//   const { code } = req.query;
//   const { tokens } = await oauth2Client.getToken(code);
//   oauth2Client.setCredentials(tokens);

//   // Get the user's email address
//   const oauth2 = google.oauth2({
//     auth: oauth2Client,
//     version: 'v2'
//   });
//   const userInfo = await oauth2.userinfo.get();
//   const userEmail = userInfo.data.email;

//   // Store the user's email in the session
//   req.session.userEmail = userEmail;
//   // Check if the email is already verified in SES
//   const ses = new AWS.SES();
//   const listIdentitiesParams = {
//     IdentityType: 'EmailAddress',
//     MaxItems: 1000
//   };
//   const listIdentitiesResponse = await ses.listIdentities(listIdentitiesParams).promise();
//   const verifiedEmails = listIdentitiesResponse.Identities;

//   if (!verifiedEmails.includes(userEmail)) {
//     // Email is not verified, initiate the verification process
//     const verifyEmailParams = {
//       EmailAddress: userEmail
//     };
//     await ses.verifyEmailIdentity(verifyEmailParams).promise();
//     console.log(`Verification email sent to ${userEmail}`);
//   } else {
//     console.log(`Email ${userEmail} is already verified`);
//   }

//   res.redirect('http://localhost:3000'); // Redirect back to the frontend
// });


// API endpoint to handle file upload and enqueue email sending task
app.post('/api/send-emails', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.log('No file uploaded.');
      return res.status(400).send('No file uploaded.');
    }
    const emailTemplate = req.body.emailTemplate; //exract email tempplate from request body from fornt end
    
    console.log('Session:', req.session);
    const customSubject = req.body.customSubject; // Extract custom subject
    const userEmail = req.session.userEmail; // Get the user's email from the session
    console.log('User Email:', userEmail);

    if (!userEmail) {
      console.error('User email not found in the session');
      return res.status(401).send('Unauthorized: User email not found');
    }

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
          
          let subject = customSubject;
          let message = req.body.customMessage;

          // let personalizedTemplate = emailTemplate;
          for (const column in data) {
            const placeholder = `{{${column}}}`;
            const value = data[column];
            // personalizedTemplate = personalizedTemplate.replace(placeholder, value);
            message = message.replace(new RegExp(placeholder, 'g'), value);
            subject = subject.replace(new RegExp(placeholder, 'g'), value);
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
                Data: subject,
              },
            },
            // Source: 'fringe.xb6783746@gmail.com',
            Source: userEmail,
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