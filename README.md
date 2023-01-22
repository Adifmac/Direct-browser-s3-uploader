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

Using pre-signed form inputs - for example: [eddturtle/direct-upload](https://github.com/eddturtle/direct-upload)

| Option              | Default     | required  | Description  |
| ------------------- | ----------- |---------- |------------- |
| addS3inputs         | n/a         | No        | use aws signature inputs.   |
| credentialsEndPoint | n/a         | Yes       | URL of aws signature provider. |
| maxWidth            | 4000        | No        | Max image width, above this the image will be resized. |
| maxHeight           | 4000        | No        | Max image height, above this the image will be resized. |
| maxPicFileSize      | 6999000.    | No        |  Max image file size. |
| maxVidFileSize      | 9999000     | No        |  Max video file size. |

Alternatively

| Option              | Default     | required  | Description  |
| ------------------- | ----------- |---------- |------------- |
| uploadUrl           | n/a         | Yes       | URL of upload destination server.   |
| prefix              | n/a         | No        | directory to add to the file name.  |




## Events:

`upload_start` fired once before pre-process starts
```
<int> number of files to processed
```

`skip-file` fired once per rejected file
```
{
	message <string> 
	size <int> file size in bytes
	name <string> file name
}
  ```

`pre-process` progress of pre-processing
```
{
	file <object>
	processed <int> already processed
	total <int> total files to process
}
```

`completion` fired once per successfully uploaded file
```
{
	<object> the file that was successfully uploaded
}
```

`total-progress` progresss of uploading files. This progress is combined for all uploading files.
```
{
	progress <int> file size based percentage uploaded
	totalFiles <int> number of files to be processed and uploaded
	uploaded <int> number of files already uploaded
}
```

`upload-done` fired once after all files were processed and uploaded. Provides all info to present the user a summary of the upload, including failed uploads and skipped files.
```
{
	uploaded <int> number of files that were successfully uploaded
	totalSize <int> total bytes uploaded (all uploaded files)
	uploadedFiles <array> array of file-objects {metadata, location, size}
	skipped <array> array of file-objects {message, name, size}
	failed <array> array of file-objects {message, name, size}
}
```

`error` fired for any error in the process
```
<mixed> xhr.response || tags processing error || fileReader error
```




## Dependencies
Using [mattiasw/ExifReader](https://github.com/mattiasw/ExifReader) for parsing exif & xmp metadata.
That's it!

