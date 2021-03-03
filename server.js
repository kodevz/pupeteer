const express = require('express');
const pupperender = require('./middleware');

const app = express();

app.use(pupperender.makeMiddleware({}));

app.use(express.static('files'));
// Making Express listen on port 7000
app.listen(7000, function () {
    console.log('Running on port 7000.');
});
