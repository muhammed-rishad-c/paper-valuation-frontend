const express=require('express')
const path=require('path')
require('dotenv').config()

const app=express()
const PORT=process.env.PORT
 
app.set('view engine','ejs')
app.set('views',path.join(__dirname,'src/views'))

app.use(express.static(path.join(__dirname,'src/public')));

const indexRoutes=require('./src/routes/index');
app.use('/',indexRoutes);

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { title: 'Error', message: 'Something broke!' });
});

app.listen(PORT, () => {
    console.log(`Node.js API Gateway running on http://localhost:${PORT}`);
    console.log(`Proxying to Python at ${process.env.PYTHON_API_URL}`);
});