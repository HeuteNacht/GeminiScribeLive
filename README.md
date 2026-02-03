
# Gemini Scribe Live - 部署与设置指南

这是一个基于 React 和 Google Gemini API 开发的实时转录与字幕生成应用。

## 1. 设置 Google API Key
1.  **获取 Key**：访问 [Google AI Studio](https://aistudio.google.com/)。
2.  **创建项目**：登录后点击 "Get API key"，选择或创建一个项目来生成 Key。
3.  **安全性**：**切勿**将 Key 直接写在源代码中上传到 GitHub。本应用已配置为从环境变量 `process.env.API_KEY` 中读取。

## 2. 上传至 GitHub
在你的本地项目根目录下，打开终端运行以下命令：

```bash
# 初始化 Git 仓库
git init

# 添加所有文件
git add .

# 提交更改
git commit -m "Initial commit: Gemini Scribe Live app"

# 在 GitHub 上创建一个新的仓库，然后关联它
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 3.1 部署到云端服务器 (推荐 Vercel)
Vercel 是部署此类前端应用最简单且免费（个人使用）的平台：

1.  **关联账号**：在 [Vercel](https://vercel.com/) 注册并关联你的 GitHub 账号。
2.  **导入项目**：点击 "Add New" -> "Project"，选择你刚才上传的仓库。
3.  **配置环境变量 (关键)**：
    *   在部署页面的 "Environment Variables" 部分。
    *   **Name**: `API_KEY`
    *   **Value**: 输入你刚才从 Google AI Studio 获取的 API Key。
4.  **点击 Deploy**：稍等几分钟，Vercel 会为你生成一个公共的 HTTPS 访问链接。
## 3.2 部署到 Vultr (VPS 服务器)
如果您希望在自己的 Vultr 云服务器上运行，请遵循以下步骤：

### 第一步：准备服务器
1.  在 Vultr 购买一个 **Ubuntu 22.04** 实例（最便宜的 5 美元方案即可）。
2.  通过 SSH 登录服务器：`ssh root@你的服务器IP`。

### 第二步：安装 Nginx
```bash
sudo apt update
sudo apt install nginx -y
```

### 第三步：上传文件
1.  将本项目所有文件上传到服务器的 `/var/www/html` 目录。
2.  可以使用 `scp` 命令或 FileZilla。
    *   `scp -r ./* root@你的服务器IP:/var/www/html`

### 第四步：处理 API Key
由于 VPS 只是提供静态文件，浏览器无法直接读取系统环境变量。
**方法 A (使用构建工具)**：在本地运行 `npm run build`，并在 CI/CD 中注入 Key。
**方法 B (手动替换，仅限私用)**：
在服务器上编辑 `App.tsx`，将 `process.env.API_KEY` 替换为 `"你的真实APIKey"`。
> *注意：这会导致 Key 暴露在前端代码中，请确保你的网页链接不被他人泄露。*

### 第五步：配置 HTTPS (关键)
浏览器要求麦克风权限必须在 HTTPS 下运行。使用 Certbot 获取免费证书：
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d 你的域名.com
```

### 第六步：Nginx 配置示例
编辑 `/etc/nginx/sites-available/default`：
```nginx
server {
    listen 80;
    server_name 你的域名.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
Vultr 部署难点：在于 HTTPS。如果你没有购买域名并指向 Vultr IP，你将无法通过手机 Safari 调用麦克风进行实时转录。
推荐方案：对于初学者，Vercel 是更好的选择。它完全免费，且自带 HTTPS 域名，你只需要把代码传到 GitHub 即可一键完成。
---
## 4. 为什么要在云端运行？
*   **HTTPS 强制要求**：浏览器处于安全考虑，只有在 `localhost` 或 `HTTPS` 环境下才允许网页调用麦克风。云端部署自动提供 HTTPS。
*   **跨设备访问**：部署后，你可以直接在 iPhone/iPad 的 Safari 浏览器中打开该链接进行实时转录。

## 5. 处理 1.5 小时长视频的技巧
*   **音频提取**：使用 FFmpeg 提取 64kbps 的单声道 MP3。
*   **分段处理**：将音频切成每段 10-15 分钟（建议不超过 50MB）。
*   **分批上传**：本应用的文件模式支持处理这些音频片段并导出对应的 `.srt` 字幕文件。
