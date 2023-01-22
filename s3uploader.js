class S3Uploader {
    constructor() {
        this._handleTotalProgress = this.throttle(this._handleTotalProgress.bind(this), 160);
    }
    async init(options) {
        this.files = [];
        this.pack = [];
        this.uploaded = [];
        this.skipped = [];
        this.failed = [];
        this.listeners = {};
        this.filesUploadProgressData = [];
        this.done = 0;
        this.totalSize = 0;
        this.accumulatedSize = 0;

        this.options = options;

        // set defaults:
        if (!this.options.maxWidth) this.options.maxWidth = 4000;
        if (!this.options.maxHeight) this.options.maxHeight = 4000;
        if (!this.options.maxPicFileSize) this.options.maxPicFileSize = 6999000;
        if (!this.options.maxVidFileSize) this.options.maxVidFileSize = 9999000;

        // load aws credentials:
        if (this.options.addS3inputs) {
            // verify credentials endpoint is provided:
            if (!this.options.credentialsEndPoint) throw new Error('Missing credential endpoint');
            try {
                let loaded = await this._getFormInputs();
                this.options.formInputs = {};
                this.options.formInputs.policy = loaded.inputsValues.policy;
                this.options.formInputs.credential = loaded.inputsValues['X-amz-credential'];
                this.options.formInputs.algorithm = loaded.inputsValues['X-amz-algorithm'];
                this.options.formInputs.x_amz_date = loaded.inputsValues['X-amz-date'];
                this.options.formInputs.signature = loaded.inputsValues['X-amz-signature'];
                this.options.formInputs.expires = loaded.inputsValues['Expires'];
                this.options.formInputs.cacheControl = loaded.inputsValues['CacheControl'];
                this.options.formInputs.url = decodeURIComponent(loaded.formUrl);
                this.options.formInputs.tenantDir = loaded.directory;
                this.options.directory = [loaded.directory];
            } catch (err) {
                throw new Error(err);
            }
        } else {
            // verify upload endpoint is provided:
            if (!this.options.uploadUrl) throw new Error('Missing upload URL (uploadUrl)');

            this.options.formInputs = { url: decodeURIComponent(this.options.uploadUrl) };

            // set directory prefix
            if (this.options.prefix) this.options.directory = [this.options.prefix];
        }
    }
    addFile(file) {
        this.files.push(file);
    }
    addEventListener(event, listener) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
    }
    removeEventListener(event, listener) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    }
    async start_upload() {
        this._dispatchEvent('upload_start', this.files.length);

        // Pre-processing
        for (const [i, file] of this.files.entries()) {
            let fileObj = await this._processFile(file);
            if (typeof fileObj === 'object') {
                this.pack.push(fileObj);
            }
            this._dispatchEvent('pre-process', { file: fileObj, processed: i, total: this.files.length });
        }
        // Start uploading
        this._manageTransfers();
    }
    async _processFile(file) {
        try {
            // check file size limit
            if (!this._checkFileSize(file)) {
                let skippedObj = { message: 'file size too large', size: file.size, name: file.name };
                this.skipped.push(skippedObj);
                this._dispatchEvent('skip-file', skippedObj);
                this._reportDone();
                return false;
            }

            // Extract metadata
            let metadata = await this._getFileInfo(file);

            // Rename file
            let newFileName = this._rename(file.name);

            // Fix image size
            let fixed_file = await this._fixImageSize(file);
            metadata.size = fixed_file.size;
            this.accumulatedSize += fixed_file.size;

            return {
                oldFileName: file.name,
                fileSize: fixed_file.size,
                fileType: file.type,
                newFileName: newFileName,
                metadata: metadata,
                fixed_file: fixed_file
            };
        } catch (error) {
            this._dispatchEvent('error', error);
            return false;
        }

    }
    async _manageTransfers() {
        // Get the number of concurrent uploads the browser can handle
        let concurrentUploads = navigator.hardwareConcurrency || 4;

        // Create a queue for the files
        let fileQueue = this.pack;

        // Create an array to store the promises for the current uploads
        let currentUploads = [];
        var pushed = 0, i = 0;
        while (fileQueue.length > 0 || currentUploads.length > 0) {
            // Add new files to the current uploads array
            while (fileQueue.length > 0 && currentUploads.length < concurrentUploads) {
                let file = fileQueue.shift();
                currentUploads.push({ id: pushed, prom: this._transferFile(file) });
                pushed++;
            }

            // Wait for the first current upload to complete
            let completedUpload = await Promise.race(currentUploads);

            // Remove the completed upload from the current uploads array
            currentUploads = currentUploads.filter(upload => upload.id != completedUpload.id);

            // Safety??
            if (i >= this.files.length + 30) return;
            i++;
        }
    }
    async _transferFile(fileObj) {
        // Perform the actual upload using XHR
        let awsResponse = await this._doXHRupload(fileObj);

        let uploadObj = { metadata: fileObj.metadata, location: awsResponse.location, size: awsResponse.size };

        // Dispatch completion event
        this._dispatchEvent('completion', uploadObj);

        // store in uploaded list
        this.uploaded.push(uploadObj);

        this._reportDone();
    }
    async _doXHRupload(fileObj) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            let formData = new FormData();
            formData.append('key', fileObj.newFileName);
            formData.append('Content-Type', fileObj.fileType);
            formData.append('acl', 'public-read');
            formData.append('success_action_status', 201);
            if (this.options.addS3inputs) {
                formData.append('policy', this.options.formInputs.policy);
                formData.append('X-amz-credential', this.options.formInputs.credential);
                formData.append('X-amz-algorithm', this.options.formInputs.algorithm);
                formData.append('X-amz-date', this.options.formInputs.x_amz_date);
                formData.append('X-amz-signature', this.options.formInputs.signature);
                formData.append('Expires', this.options.formInputs.expires);
                formData.append('CacheControl', this.options.formInputs.cacheControl);
            }
            formData.append('file', fileObj.fixed_file);

            // Open the XHR request
            xhr.open('POST', this.options.formInputs.url);

            // store upload progress item
            let progItem = { size: fileObj.fileSize, uploaded: 0, totalSize: 0 };
            this.filesUploadProgressData.push(progItem);
            let actualSize = 0;

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    progItem.uploaded = event.loaded;
                    progItem.totalSize = event.total;
                    actualSize = event.total;

                    // Dispatch total progress event
                    this._handleTotalProgress();
                }
            };

            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status === 201) {
                        let doc = new window.DOMParser().parseFromString(xhr.response, 'text/xml');
                        let location = doc.documentElement.childNodes[0].textContent.replace(/%2F/g, '/');
                        resolve({ location: location, size: actualSize });
                    } else {
                        // Dispatch error event
                        this.failed.push({ message: xhr.response, size: fileObj.fileSize, name: fileObj.oldFileName });
                        this._dispatchEvent('error', xhr.response);
                        reject(xhr.response);
                    }
                }
            };

            xhr.onerror = (event) => {
                this.failed.push({ message: event, size: fileObj.fileSize, name: fileObj.oldFileName });
                reject(event);
            };

            // Send the form data
            xhr.send(formData);
        });
    }
    async _getFileInfo(file) {
        let img_info;
        if (file.type.startsWith('image/')) {
            img_info = await this._extractMetadata(file);
        } else if (file.type.startsWith('video/')) {
            img_info = await this._extractVideoInfo(file);
        }
        return img_info;
    }
    async _fixImageSize(file) {
        // Reduce image size if exceeds defined max width and height
        if (file.type.startsWith('image/')) {
            let image = await this._createImage(file);
            let { width, height } = image;
            if (width > this.options.maxWidth || height > this.options.maxHeight) {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                // calculate width & height:
                let dimensions = this._resolveSize(width, height);
                canvas.width = dimensions.width;
                canvas.height = dimensions.height;
                ctx.drawImage(image, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
                file = this._dataURItoBlob(canvas.toDataURL('image/jpeg'));
                canvas = null;
            }
        }
        return file;
    }
    async _createImage(file) {
        return new Promise((resolve, reject) => {
            let image = new Image();
            image.onload = () => {
                resolve(image);
            };
            image.onerror = (error) => {
                reject(error);
            };
            image.src = URL.createObjectURL(file);
        });
    }
    async _getFormInputs() {
        let response = await fetch(this.options.credentialsEndPoint, {
            method: 'post',
            mode: 'same-origin',
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                'method': 'getUploadFormInputs' // Replace with your implementation..
            }),
        });
        let formInputs = await response.json();
        return formInputs;
    }
    _handleTotalProgress() {
        let totalUploaded = 0, totalFiles = 0;
        this.filesUploadProgressData.forEach(item => {
            totalFiles += item.totalSize;
            totalUploaded += item.uploaded;
        });
        this.totalSize = totalFiles;
        this._dispatchEvent('total-progress', {
            progress: Math.floor((totalUploaded / this.accumulatedSize) * 100),
            totalFiles: this.files.length,
            uploaded: this.done
        });
    }
    _reportDone() {
        this.done++;
        // check if last file
        if (this.done >= this.files.length) {
            this._dispatchEvent('upload-done', {
                uploaded: this.uploaded.length,
                totalSize: this.totalSize,
                uploadedFiles: this.uploaded,
                skipped: this.skipped,
                failed: this.failed
            });
        }
    }
    _dataURItoBlob(dataURI) {
        let byteString = atob(dataURI.split(',')[1]);
        let mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        let ab = new ArrayBuffer(byteString.length);
        let ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        let blob = new Blob([ab], { type: mimeString });
        return blob;
    }
    _rename(name) {
        let clean_name = this._fixFileName(name);
        let directories = this.options.directory;
        let timestamp = Date.now();
        let path = directories.length ? directories.join('/') + '/' : '';
        return `${path}${timestamp}_${clean_name}`;
    }
    _fixFileName(str) {
        let name, ext = 'jpg', parts = str.split('.');
        if (parts.length > 1) {
            ext = parts.pop().toLowerCase().slice(0, 4);
            if (ext.length > 4) {
                ext = 'jpg';
            }
            name = parts.join();
        } else {
            name = str;
        }
        name = name.replace(/[^\w\- ]+/g, '') // Remove all non-word, non-space, and non-dash chars
            .trim() // remove leading and trailing white spaces
            .replace(/\s+/g, '-') // replace whitespaces with dash
            .replace(/-+/g, '-') // Replace multiple - with single -
            .replace(/^[-_]+|[-_]+$/g, ''); // remove leading and trailing dash or underscore
        if (name.length < 3) {
            name += 'pic_' + (Math.random() + 1).toString(36).substring(4, 10);
        }
        return `${name}.${ext}`;
    }
    _checkFileSize(file) {
        if (file.type.startsWith('image/')) {
            return file.size < this.options.maxPicFileSize;
        } else if (file.type.startsWith('video/')) {
            return file.size < this.options.maxVidFileSize;
        } else {
            return false;
        }
    }
    _resolveSize(width, height) {
        let w = width;
        let h = height;
        let ratio = w / h;
        if (width > this.options.maxWidth) {
            w = this.options.maxWidth;
            h = Math.floor(w / ratio);
        }
        if (h > this.options.maxHeight) {
            h = this.options.maxHeight;
            w = Math.floor(h * ratio);
        }
        return { width: w, height: h };
    }
    _dispatchEvent(event, data) {
        if (!this.listeners[event])return;
        this.listeners[event].forEach(listener => listener(data));
    }
    _extractMetadata(file) {
        var self = this;
        return new Promise((resolve, reject) => {
            var reader = new FileReader();
            reader.onload = function (readerEvent) {
                var out = {};
                try {
                    let tags = ExifReader.load(readerEvent.target.result);
                    delete tags['MakerNote'];
                    out = {
                        city: tags['City']?.description,
                        country: tags['Country']?.description ?? tags['State']?.description,
                        natWidth: tags['ImageWidth']?.description,
                        natHeight: tags['ImageLength']?.description,
                        description: tags['ImageDescription']?.description ?? tags['Caption/Abstract']?.description ?? tags['description']?.description,
                        keywords: tags['subject']?.description ?? tags['Keywords']?.map(p => p.description)?.join(','),
                    };
                } catch (err) {
                    console.log('Error parsing EXIF/XMP data: ', err);
                }
                var image = new Image();
                let _URL = window.URL || window.webkitURL;
                let blob = new Blob([readerEvent.target.result], { type: 'image/jpeg' });
                image.src = _URL.createObjectURL(blob);
                image.onload = function () {
                    // calculate width & height:
                    let dimensions = self._resolveSize(this.width, this.height);
                    out.width = dimensions.width;
                    out.height = dimensions.height;
                    resolve(out);
                };
            };
            reader.onerror = function (error) {
                reject({ status: 'fail', message: error });
            };
            //reader.readAsDataURL(file);
            reader.readAsArrayBuffer(file);
        });
    }
    _extractVideoInfo(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = URL.createObjectURL(file);
            video.onloadedmetadata = () => {
                window.URL.revokeObjectURL(video.src);
                let width = video.videoWidth;
                let height = video.videoHeight;
                let duration = video.duration;
                resolve({ width: width, height: height, size: file.size, duration: duration });
            };
            video.onerror = reject;
        });
    }
    throttle(callback, limit) {
        var wait = false;
        return function () {
            if (!wait) {
                callback.call();
                wait = true;
                setTimeout(function () {
                    wait = false;
                }, limit);
            }
        };
    }
}
