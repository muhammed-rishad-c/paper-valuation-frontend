# 📄 Automated Paper Evaluation System — Orchestrator Layer

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-B4CA65?style=for-the-badge&logo=ejs&logoColor=black)
![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white)

> The central orchestration layer that bridges the user interface, database, and AI evaluation engine.

---

## 📌 Overview

This repository is the **central orchestration layer** of the Automated Paper Evaluation System. Built with **Node.js** and **Express**, it manages the web interface, handles persistent storage via **Neon PostgreSQL**, and coordinates REST API communication with a Python-based AI microservice.

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼─────────────────────────────────┐
│               NODE.JS / EXPRESS  ORCHESTRATOR                │
│                                                              │
│   ┌─────────────┐    ┌────────────────┐    ┌─────────────┐  │
│   │  EJS Views  │    │  Controllers   │    │   Routes    │  │
│   └─────────────┘    └───────┬────────┘    └─────────────┘  │
└─────────────────────────────┬┴──────────────────────────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
 ┌────────────▼──────────┐       ┌─────────────▼──────────┐
 │    Neon  PostgreSQL   │       │    Python Flask API     │
 │  (Persistent Storage) │       │  (OCR + NLP Scoring)   │
 └───────────────────────┘       └────────────────────────┘
```

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| **Frontend** | EJS Template Engine | Server-side rendered UI |
| **Server** | Node.js + Express | Routing & business logic |
| **Database** | Neon PostgreSQL | Persistent evaluation records |
| **AI Bridge** | Axios → Python Flask | OCR + semantic scoring |

---

## 📂 Project Structure

```
📦 orchestrator/
├── 📁 controllers/     # Business logic & Flask API coordination
├── 📁 routes/          # Express route definitions
├── 📁 models/          # Database schemas & Neon DB connection
├── 📁 views/           # EJS templates for the frontend
├── 📁 public/          # Static assets — CSS, JS, Images
└── 📄 app.js           # Entry point & server configuration
```

---

## 🔄 Evaluation Workflow

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
  │  1. UPLOAD   │────▶│ 2. PROCESS   │────▶│    3. AI EVALUATE    │
  │              │     │              │     │                      │
  │ User uploads │     │ Express ctrl │     │ Flask runs OCR via   │
  │ answer sheet │     │ receives file│     │ Google Cloud Vision  │
  │ via web UI   │     │ → calls Flask│     │ + Sentence Transform │
  └──────────────┘     └──────────────┘     └──────────┬───────────┘
                                                        │
  ┌──────────────┐     ┌──────────────┐                │
  │  5. FEEDBACK │◀────│ 4. PERSIST   │◀───────────────┘
  │              │     │              │
  │ Score shown  │     │ Results saved│
  │ to user live │     │ in Neon DB   │
  └──────────────┘     └──────────────┘
```

### Step-by-Step

1. **Submission** — User uploads a handwritten answer sheet image via the EJS web interface.
2. **Processing** — The Express controller receives the file and sends an async request to the Flask API via Axios.
3. **AI Evaluation** — Flask performs OCR using **Google Cloud Vision** and semantic scoring using **Sentence Transformers**, returning structured results.
4. **Persistence** — Evaluation results are stored in **Neon PostgreSQL** for record-keeping.
5. **Feedback** — The final score and evaluation breakdown are displayed to the user in real time.

---

## ⚙️ Installation & Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Neon](https://neon.tech/) PostgreSQL database instance
- Python Flask AI microservice up and running *(see companion repo)*

### 1. Clone the Repository

```bash
git clone <your-repo-link>
cd <repo-folder>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
DATABASE_URL=your_neon_postgres_connection_string
FLASK_API_URL=your_flask_backend_url
```

### 4. Start the Server

```bash
npm start
```

The app will be live at **http://localhost:3000** 🚀

---

## 🔗 Related Repositories

| Repository | Description |
|-----------|-------------|
| `paper-eval-ai-service` | Python Flask microservice — OCR + NLP semantic scoring |

---

## 🛡️ License

This project was developed as part of a **Final Year Engineering Capstone**.
All rights reserved © 2024.
