document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    
    let fileInput = document.getElementById('pdfFile');
    let file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file to upload.');
        return;
    }
    
    let formData = new FormData();
    formData.append('pdf', file);
    
    let xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) {
            let percentComplete = (e.loaded / e.total) * 100;
            document.getElementById('progressBar').style.width = percentComplete + '%';
        }
    });
    
    xhr.addEventListener('load', function () {
        if (xhr.status === 200) {
            alert('File uploaded successfully!');
        } else {
            alert('Failed to upload file. Server responded with status ' + xhr.status);
        }
        document.getElementById('progressBar').style.width = '0%';
    });
    
    xhr.addEventListener('error', function () {
        alert('An error occurred while uploading the file.');
        document.getElementById('progressBar').style.width = '0%';
    });
    
    // Make sure this endpoint matches your Vercel API route
    xhr.open('POST', '/api/upload', true);
    xhr.send(formData);
});