document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    
    let fileInput = document.getElementById('pdfFile');
    let file = fileInput.files[0];
    
    let formData = new FormData();
    formData.append('pdf', file);
    
    let xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) {
            let percentComplete = (e.loaded / e.total) * 100;
            document.getElementById('progressBar').style.width = percentComplete + '%';
        }
    }, false);
    
    xhr.addEventListener('load', function () {
        if (xhr.status === 200) {
            alert('File uploaded successfully!');
            document.getElementById('progressBar').style.width = '0%';
        } else {
            alert('Failed to upload file.');
            document.getElementById('progressBar').style.width = '0%';
        }
    }, false);
    
    xhr.addEventListener('error', function () {
        alert('An error occurred.');
        document.getElementById('progressBar').style.width = '0%';
    }, false);
    
    xhr.open('POST', '/api/upload', true);
    xhr.send(formData);
});
