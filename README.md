<a name="readme-top"></a>

<div align="center">
  <h3><b>AI-Driven Impact Measurement & Early Warning System for Refugee-Led Microenterprises</b></h3>
  <p>
    Carnegie Mellon University Africa · Engineering Artificial Intelligence Capstone  
    <br />
    Partner Organization: Inkomoko
  </p>
</div>

---

# 📗 Table of Contents

- [📖 About the Project](#about-project)
  - [🎯 Project Goals](#project-goals)
  - [🧠 System Overview](#system-overview)

- [🛠 Built With](#built-with)
  - [Tech Stack](#tech-stack)
  - [Key Features](#key-features)

- [🏗 Architecture & Development Strategy](#architecture)
- [💻 Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Install](#install)
  - [Usage](#usage)

- [👥 Authors](#authors)
- [🔭 Future Features](#future-features)
- [🤝 Contributing](#contributing)
- [📝 License](#license)

---

# 📖 About the Project <a name="about-project"></a>

**AI-Driven Impact Measurement & Early Warning System for Refugee-Led Microenterprises** is an end-to-end decision-support platform designed to help Inkomoko proactively identify vulnerable refugee- and host-community-owned businesses, measure program impact, and support data-driven intervention planning.

The system combines **impact measurement**, **predictive risk modeling**, and **interactive dashboards** to provide actionable insights at the **client**, **portfolio**, and **country** levels.

---

## 🎯 Project Goals <a name="project-goals"></a>

- Track key impact indicators such as income growth, business survival, job creation, and access to finance
- Predict enterprise-level distress or default with early warning lead time
- Support program teams in prioritizing interventions
- Enable organizational learning through portfolio-level analytics
- Provide a scalable and interpretable AI solution suitable for fragile contexts

---

## 🧠 System Overview <a name="system-overview"></a>

The platform consists of:

- A **FastAPI-based backend** for authentication, scoped data access, feature processing, and model inference
- A **Next.js + Tailwind CSS frontend** for dashboards and role-based user interaction
- **Machine learning models** trained concurrently with UI/API development
- A modular design allowing dummy data to be replaced seamlessly with real data

The executive overview dashboard now includes richer analytics contracts for:

- country comparison,
- sector-risk summary,
- anomaly signals,
- confidence-aware trends.

---

# 🛠 Built With <a name="built-with"></a>

## Tech Stack <a name="tech-stack"></a>

<details>
  <summary><b>Frontend</b></summary>
  <ul>
    <li><a href="https://nextjs.org/">Next.js</a></li>
    <li><a href="https://tailwindcss.com/">Tailwind CSS</a></li>
    <li>Charting (Recharts / Chart.js)</li>
  </ul>
</details>

<details>
  <summary><b>Backend</b></summary>
  <ul>
    <li><a href="https://fastapi.tiangolo.com/">FastAPI</a></li>
    <li>RESTful APIs for inference and data access</li>
  </ul>
</details>

<details>
  <summary><b>Machine Learning</b></summary>
  <ul>
    <li>Python (Pandas, NumPy, Scikit-learn)</li>
    <li>Interpretable models (Logistic Regression, Tree-based models)</li>
    <li>Lightweight NLP (TF-IDF for advisor notes)</li>
  </ul>
</details>

<details>
  <summary><b>Data & Storage</b></summary>
  <ul>
    <li>PostgreSQL / MySQL (planned)</li>
    <li>Dummy JSON/CSV data for prototyping</li>
  </ul>
</details>

---

## Key Features <a name="key-features"></a>

- **Role-based dashboards** (Admin, Program, Field, Finance, Donor)
- **Enterprise risk scoring** with early warning flags
- **Impact KPIs** across income, jobs, survival, and finance
- **Portfolio-level trend analysis**
- **Scenario simulation** for macroeconomic shocks
- **End-to-end prototype** using dummy data
- **Clear separation** between UI, API, and ML layers

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

# 🏗 Architecture & Development Strategy <a name="architecture"></a>

To ensure timely delivery and reduce integration risk, the project follows a **parallel development approach**:

- **Model development** (feature engineering, baseline models, evaluation)
- **Backend API development** (Flask inference endpoints)
- **Frontend dashboard development** (Next.js UI with dummy data)

These components are developed **concurrently**, with final stages focused on **integration**, validation, and refinement.

This approach ensures:

- Early visualization of expected outputs
- Clear contracts between data, models, and UI
- Faster iteration and reduced last-stage risk

---

# 💻 Getting Started <a name="getting-started"></a>

## Prerequisites

- Node.js (v18+ recommended)
- Python 3.9+
- npm or yarn
- Git

---

## Setup

Clone the repository:

```sh
git clone https://github.com/your-org/inkomoko-earlywarning-system.git
cd inkomoko-early-warning-system
```

---

## Install

### Frontend

```sh
cd frontend
npm install
```

### Backend

```sh
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## Usage

### Run Backend (FastAPI)

```sh
cd backend
uvicorn app.main:app --reload --port 8000
```

### Run Frontend (Next.js)

```sh
cd frontend
npm run dev
```

Open your browser at:
👉 `http://localhost:3000`

### One-off anonymized CSV upload to PostgreSQL

Run this from project root when you want to load anonymized source CSVs into raw Postgres tables:

```sh
pip install -r backend/requirements.txt
DATABASE_URL="postgresql://postgres:<password>@localhost:5432/inkomoko_early_warning" python upload_anonymized_data.py
```

Optional dry run (no DB writes):

```sh
python upload_anonymized_data.py --dry-run
```

This creates/loads these tables:

- `anon_baseline_raw`
- `anon_endline_raw`
- `anon_investment_raw`

---

# 👥 Authors <a name="authors"></a>

👤 **Samuel Wanza**

- GitHub: [Samuelwanza](https://github.com/Samuelwanza)
- LinkedIn: [https://www.linkedin.com/in/samuel-munguti/](https://www.linkedin.com/in/samuel-munguti/)

👤 **Violette Uwamungu**

- GitHub: [VioletteUwamungu](https://github.com/VioletteUwamungu)
- LinkedIn: [https://www.linkedin.com/in/violette-uwamungu-74b4bb184/](https://www.linkedin.com/in/violette-uwamungu-74b4bb184/)

👤 **Candide Giramata Muhoracyeye**

- GitHub: [GiramataC](https://github.com/GiramataC)
- LinkedIn: [https://www.linkedin.com/in/giramata-muhoracyeye-candide-a75ab9231/](https://www.linkedin.com/in/giramata-muhoracyeye-candide-a75ab9231/)

👤 **Matia Mulumba Mukasa**

- GitHub: [tr3p0l3m](https://github.com/tr3p0l3m)
- LinkedIn: [https://www.linkedin.com/in/matiamulumbamukasa/](https://www.linkedin.com/in/matiamulumbamukasa/)

Faculty Advisor: **Dr. George Okeyo**, CMU Africa

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

# 🔭 Future Features <a name="future-features"></a>

- Integration with live Inkomoko data systems
- Automated retraining pipelines
- Explainability dashboards (SHAP-style summaries)
- Donor-facing reporting exports
- Multi-country comparative analytics

---

# 🤝 Contributing <a name="contributing"></a>

Contributions are welcome through issues and pull requests.
Please ensure alignment with ethical data use and project scope.

---

# 📝 License <a name="license"></a>

This project is licensed under the **MIT License**.
