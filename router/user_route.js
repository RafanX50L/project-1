const express = require('express');
const user_route = express.Router(); // Use express.Router()

user_route.get('/', (req, res) => {
    // res.render('user/ownlanding')
    res.render('user/landing.ejs')
});

module.exports = user_route; // Export the router
