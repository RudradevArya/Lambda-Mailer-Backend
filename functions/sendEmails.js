// const AWS = require('aws-sdk');
// const s3 = new AWS.S3();
// const ses = new AWS.SES();
// const csv = require('csv-parser');
// const fs = require('fs');

// exports.handler = async (event) => {
//   try {
//     // Extract the file path and custom message from the SQS event
//     const { filePath, customMessage } = JSON.parse(event.Records[0].body);

//     // Download the CSV file from S3
//     const s3Params = {
//       Bucket: 'demo-lambda-mailer',
//       Key: filePath.split('/').pop(),
//     };
//     const fileStream = s3.getObject(s3Params).createReadStream();

//     // Read the CSV file and send emails
//     fileStream
//       .pipe(csv())
//       .on('data', (data) => {
//         const { email, name } = data;
//         const emailParams = {
//           Destination: {
//             ToAddresses: [email],
//           },
//           Message: {
//             Body: {
//               Text: {
//                 Data: `${customMessage}\n\nRegards,\nYour App`,
//               },
//             },
//             Subject: {
//               Data: 'Your Custom Email Subject',
//             },
//           },
//           Source: 'fringe.xb6783746@gmail.com',
//         };

//         ses.sendEmail(emailParams, (err, data) => {
//           if (err) {
//             console.error(`Error sending email to ${email}:`, err);
//           } else {
//             console.log(`Email sent to ${email}`);
//           }
//         });
//       })
//       .on('end', () => {
//         console.log('Email sending process completed!');
//         // Optionally, publish a notification to SNS topic
//       });
//   } catch (error) {
//     console.error('Error:', error);
//   }
// };