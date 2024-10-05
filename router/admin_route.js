const express = require('express');
const admin_route = express.Router(); // Use express.Router()

admin_route.get('/', (req, res) => {
    res.send('hello world');
});

module.exports = admin_route; // Export the router
