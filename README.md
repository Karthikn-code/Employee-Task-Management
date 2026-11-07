# TaskFlow – Employee Task Management System

**TaskFlow** is a full-stack web application designed to simplify employee task assignment, progress tracking and task verification. It provides separate dashboards for administrators and employees, with real-time updates and notification support.

## Key Features

- **Authentication:** JWT-based authentication and role-based access control.
- **Admin Dashboard:** Monitor employees, tasks and overall task progress.
- **Employee Management:** Create, update, activate, deactivate and manage employee records.
- **Task Management:** Assign tasks with descriptions, priorities and due dates.
- **Task Verification:** Employees submit completed tasks for admin approval or rejection.
- **Real-Time Updates:** WebSocket-based communication for task and notification events.
- **Notifications:** Database-backed notifications with read/unread status.
- **Analytics:** Dashboard-based task progress monitoring.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Authentication | JWT, Argon2 |
| Real-Time Communication | WebSockets |
| API Communication | Axios |
| Tools | VS Code, Git, GitHub |

## System Architecture

```text
Admin / Employee
       |
       v
Next.js Frontend
(React + TypeScript)
       |
       v
FastAPI Backend
       |
       +------ REST APIs
       |
       +------ WebSockets
       |
       v
SQLAlchemy ORM
       |
       v
PostgreSQL Database
```

## Task Verification Workflow

1. Admin creates and assigns a task.
2. Employee works on the assigned task.
3. Employee submits the completed task.
4. Admin reviews the submission.
5. Admin approves or rejects the task.
6. Employee can update and resubmit rejected tasks.

## Project Structure

```text
Employee-Task-Management/
│
├── backend/
│   ├── routers/
│   ├── auth.py
│   ├── database.py
│   ├── dependencies.py
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── security.py
│   └── websocket_manager.py
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── package.json
│
├── .gitignore
└── README.md
```

## Installation and Setup

### Prerequisites
- Python
- Node.js and npm
- PostgreSQL
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Karthikn-code/Employee-Task-Management.git
cd Employee-Task-Management
```

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
```

Activate the environment on Windows:

```powershell
.venv\Scripts\activate
```

Install the backend dependencies and configure the required environment variables.

Create the PostgreSQL database:

```sql
CREATE DATABASE employee_task_manager;
```

Start the backend:

```bash
fastapi dev main.py
```

API documentation: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:3000`

Configure the frontend API and WebSocket URLs to connect to the backend.

**Note:** Configure the database credentials and JWT secret through environment variables. Never commit `.env` files or credentials to GitHub.

## Future Enhancements

- Email notifications.
- Advanced employee performance analytics.
- Exportable task reports.
- Automated testing and deployment.

## Author

**Karthik N**

GitHub: [Karthikn-code](https://github.com/Karthikn-code)

**Repository:** [Employee-Task-Management](https://github.com/Karthikn-code/Employee-Task-Management)

---

*TaskFlow – Organize Work. Track Progress. Achieve More.*
