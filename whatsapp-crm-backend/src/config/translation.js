const { Translate } = require('@google-cloud/translate').v2;
const path = require('path');

// Initialize Google Cloud Translation client
const translate = new Translate({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../../google-credentials.json')
});

module.exports = translate;