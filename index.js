const express = require("express");
const session = require("express-session");
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/user_details');
const app = express();

const path = require('path')
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'view'));

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
    secret:'secret-key',
    resave:true,
    saveUninitialized:true
}))
app.use((req,res,next)=>{
    res.set('cache-control','no-store');
    next()
})
app.use(express.static('public'));



const userRoute = require('./router/user_route');
const adminRoute = require('./router/admin_route');

app.use('/',userRoute);
app.use('/admin',adminRoute);

app.listen(3000,()=>{
    console.log("server is running in localhost 3000");
    
})