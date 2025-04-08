# AI日报自动生成系统

基于RSS源自动生成AI日报的系统，并提供归档功能。

## 功能特点

- 自动从多个RSS源获取AI相关新闻
- 使用OpenAI API生成内容摘要
- 自动分类和关键词提取
- 每日定时更新和自动归档
- 美观的前端展示界面
- 历史日报浏览功能

## 安装和使用

### 前提条件

- Node.js 14.x 或更高版本
- npm 或 yarn

### 安装步骤

1. 克隆此仓库
   ```
   git clone <仓库地址>
   cd ai-daily-report
   ```

2. 安装依赖
   ```
   npm install
   ```

3. 配置环境变量
   
   创建 `.env` 文件并添加以下内容:
   ```
   PORT=3000
   OPENAI_API_KEY=your_openai_api_key  # 可选，如果不设置将使用简单摘要生成
   ```

4. 启动应用
   ```
   npm start
   ```
   应用将在 http://localhost:3000 上运行

## 自定义RSS源

你可以在`server.js`中修改`RSS_SOURCES`数组来自定义RSS源:

```javascript
const RSS_SOURCES = [
  { url: 'https://your-rss-source-1.com/feed', category: 'category1' },
  { url: 'https://your-rss-source-2.com/feed', category: 'category2' },
  // 添加更多RSS源...
];
```

## 定时更新配置

本系统默认每天上午9点更新日报，晚上23:59归档。你可以在`server.js`中修改cron表达式来调整这些时间:

```javascript
// 每天上午9点更新日报
cron.schedule('0 9 * * *', async () => {
  // ...
});

// 每天23:59归档当前日报
cron.schedule('59 23 * * *', () => {
  // ...
});
```

## 技术栈

- 后端: Node.js, Express
- 新闻获取: RSS Parser
- 定时任务: node-cron
- AI摘要: OpenAI API
- 前端: HTML, CSS, JavaScript

## 手动操作

你也可以通过API手动触发日报生成:

- POST `/api/generate-report`: 手动生成新的日报

## API端点

- GET `/api/current-report`: 获取当前日报
- GET `/api/archived-reports`: 获取所有归档日报的列表
- GET `/api/archived-reports/:filename`: 获取特定归档日报的详情