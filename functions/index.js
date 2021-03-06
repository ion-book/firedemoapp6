'use strict';
const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')();
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

exports.generateThumbnail = functions.storage.object().onChange(event => {
      const object = event.data; // The Storage object.
    
      const fileBucket = object.bucket; // The Storage bucket that contains the file.
      const filePath = object.name; // File path in the bucket.
      const contentType = object.contentType; // File content type.
      const resourceState = object.resourceState; // The resourceState is 'exists' or 'not_exists' (for file/folder deletions).
      const metageneration = object.metageneration; // Number of times metadata has been generated. New objects have a value of 1.
    
      if (!contentType.startsWith('image/')) {
        console.log('This is not an image.');
        return;
      }
    
      // Get the file name.
      const fileName = path.basename(filePath);
      
      if (fileName.startsWith('thumb_')) {
        console.log('Already a Thumbnail.');
        return;
      }
    
      // Exit if this is a move or deletion event.
      if (resourceState === 'not_exists') {
        console.log('This is a deletion event.');
        return;
      }
    
      // Exit if file exists but is not new and is only being triggered
      // because of a metadata change.
      if (resourceState === 'exists' && metageneration > 1) {
        console.log('This is a metadata change event.');
        return;
      }
    
    
      // Download file from bucket.
      const bucket = gcs.bucket(fileBucket);
      const tempFilePath = path.join(os.tmpdir(), fileName);
      return bucket.file(filePath).download({
        destination: tempFilePath
      }).then(() => {
        console.log('Image downloaded locally to', tempFilePath);
        // Generate a thumbnail using ImageMagick.
        return spawn('convert', [tempFilePath, '-thumbnail', '200x200>', tempFilePath]);
      }).then(() => {
        console.log('Thumbnail created at', tempFilePath);
        // We add a 'thumb_' prefix to thumbnails file name. 
        const thumbFileName = `thumb_${fileName}`;
        const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);
        // Uploading the thumbnail.
        return bucket.upload(tempFilePath, {destination: thumbFilePath});
      // Once the thumbnail has been uploaded delete the local file to free up disk space.
      }).then(() => fs.unlinkSync(tempFilePath));
      
    });