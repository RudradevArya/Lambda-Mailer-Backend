const AWS = require('aws-sdk');

// Configure AWS credentials
AWS.config.update({
  accessKeyId: 'TEST',
  secretAccessKey: 'TEST',
  region: 'ap-south-1'
});

// Create an S3 client
const s3 = new AWS.S3();

// Define the bucket and object key
const bucketName = 'demo-lambda-mailer';
const objectKey = 'Demo Lambda Mailer.csv';

// Get the object from S3
s3.getObject({ Bucket: bucketName, Key: objectKey }, (err, data) => {
  if (err) {
    console.error('Error retrieving object:', err);
  } else {
    // Display the object content
    console.log('Object content:', data.Body.toString());
  }
});