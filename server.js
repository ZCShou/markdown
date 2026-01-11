const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== 静态资源服务 ====================
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 页面路由 ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'markdown.html'));
});

app.get('/markdown', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'markdown.html'));
});

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
    console.log(`Markdown 编辑器运行在 http://localhost:${PORT}`);
});
