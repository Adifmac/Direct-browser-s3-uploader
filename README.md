# Direct-browser-s3-uploader
Vanilla JS, super lightweight and fast multiple files uploader class. 

Pre-processing includes extraction of metadata tags, resizing images to max width/height.




## How to use:

1. Instantiate: 
```javascript
const uploader = new S3Uploader();
```

2. Initialize: 
```javascript
uploader.init({
	addS3inputs: true,
	credentialsEndPoint: 'url/to/aws_signature_endpoint.php',
	maxWidth: 3000,
	maxHeight: 2000,
	maxPicFileSize: 4999000,
	maxVidFileSize: 9999000,
});
```

3. Add event listeners to uploader:
```javascript
uploader.addEventListener('upload_start', (event) => {
	console.log('+upload_start', event);
});
uploader.addEventListener('pre-process', (event) => {
	console.log('+pre-process', event);
});
uploader.addEventListener('total-progress', (event) => {
	console.log('+total-progress', event);
});
uploader.addEventListener('upload-done', (event) => {
	console.log('+upload-done', event);
});
```

4. Add event listener to file input:
```javascript
fileInput.addEventListener('change', (event) => {
	const files = event.target.files;
	for (let i = 0; i < files.length; i++) {
		uploader.addFile(files[i]);
	}
	uploader.start_upload();
});
```
* You can control which file types to accept in the input.



## Options

Using pre-signed form inputs (for example using: [eddturtle/direct-upload](https://github.com/eddturtle/direct-upload)):

| Option              | Default     | Type      | required  | Description  |
| ------------------- | ----------- |---------- |---------- |------------- |
| addS3inputs         | n/a         | Boolean   | No        | use aws signature inputs.   |
| credentialsEndPoint | n/a         | String    | Yes       | URL of aws signature provider. |
| maxWidth            | 4000        | Int       | No        | Max image width, above this the image will be resized. |
| maxHeight           | 4000        | Int       | No        | Max image height, above this the image will be resized. |
| maxPicFileSize      | 6999000.    | Int       | No        |  Max image file size. |
| maxVidFileSize      | 9999000     | Int       | No        |  Max video file size. |
| directory           | n/a         | String    | No        |  directory (prefix) to prepend to the file name. |

Alternatively:

| Option              | Default     | Type      | required  | Description  |
| ------------------- | ----------- |---------- |---------- |------------- |
| uploadUrl           | n/a         | String    | Yes       | URL of upload destination server.   |
| prefix              | n/a         | String    | No        | directory (prefix) to prepend to the file name.  |




## Events:

1. `upload_start` - fired once before pre-process starts.
	- `event` (int) number of files to processed


2. `skip-file` - fired once per rejected file.
	- `event.message` (string) 
	- `event.size` (int) file size in bytes
	- `event.name` (string) file name

3. `pre-process` - fired once per file, progress of pre-processing.
	- `event.file` (object)
	- `event.processed` (int) already processed
	- `event.total` (int) total files to process

4. `completion` - fired once per successfully uploaded file.
	- `event` (object) the file that was successfully uploaded


5. `total-progress` - progresss of uploading files. This progress is combined for all uploading files.
	- `event.progress` (int) file size based percentage uploaded
	- `event.totalFiles` (int) number of files to be processed and uploaded
	- `event.uploaded` (int) number of files already uploaded


6. `upload-done` - fired once after all files were processed and uploaded. Provides all info to present the user a summary of the upload, including failed uploads and skipped files.
	- `event.uploaded` (int) number of files that were successfully uploaded
	- `event.totalSize` (int) total bytes uploaded (all uploaded files)
	- `event.uploadedFiles` (array) array of objects: {metadata, location, size}
	- `event.skipped` (array) array of objects: {message, name, size}
	- `event.failed` (array) array of objects: {message, name, size}


7. `error` - fired for any error in the process.
	- `event` (mixed) xhr.response || tags processing error || fileReader error





## Dependencies
Using [mattiasw/ExifReader](https://github.com/mattiasw/ExifReader) for parsing exif & xmp metadata.
That's it!

