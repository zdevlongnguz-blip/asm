import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.render('layout/master', {
    title: 'WeatherBot',
    page: '../pages/home',
    active: 'home',
    bodyClass: 'page-scroll',
  });
});

router.get('/chat', (req, res) => {
  res.render('layout/master', {
    title: 'Chat AI',
    page: '../pages/chat',
    active: 'chat',
  });
});

router.get('/test', (req, res) => {
  const data = {
    name: 'John Doe',
    age: 30,
    email: 'john.doe@example.com'
  };
  res.json({ message: 'Test route hoạt động tốt!', data });
});



export default router;