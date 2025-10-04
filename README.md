# 🧪 AgentLab

**AI Experiment Platform for FutureStack'25 GenAI Hackathon**

AgentLab is a cutting-edge web platform that enables users to run and compare AI experiments using Cerebras for large-scale model inference and Meta's Llama for chat completions. The entire backend is containerized with Docker, featuring real-time UI updates via WebSockets.

## 🏆 Hackathon Technologies

- **🧠 Cerebras**: Large-scale model inference for code analysis
- **🐳 Docker**: Complete containerization and deployment
- **🦙 Meta Llama**: Chat completions and conversational AI
- **⚡ FastAPI**: High-performance async backend
- **⚛️ React**: Modern, responsive frontend

## 🚀 Features

- **Dual AI Models**: Switch between Cerebras code analysis and Llama chat
- **Real-time Updates**: WebSocket integration for live experiment tracking
- **Modern UI**: Clean, responsive design with real-time status updates
- **Experiment History**: Complete tracking of all AI experiments
- **Docker Ready**: Production-ready containerization
- **SQLite Database**: Persistent storage for all experiments

## 📁 Project Structure

```
agentlab/
├── backend/
│   ├── app.py                 # FastAPI main application
│   ├── database.py            # Database configuration
│   ├── models.py              # SQLAlchemy models
│   ├── tasks.py               # AI task handlers
│   ├── requirements_new.txt   # Python dependencies
│   └── Dockerfile            # Backend containerization
├── frontend/
│   ├── src/
│   │   ├── App.js            # Main React component
│   │   ├── App.css           # Modern styling
│   │   ├── index.js          # React entry point
│   │   └── index.css         # Base styles
│   ├── public/
│   │   └── index.html        # HTML template
│   ├── package.json          # React dependencies
│   ├── Dockerfile           # Frontend containerization
│   └── nginx.conf           # Production web server config
├── docker-compose.yml       # Multi-service orchestration
├── .env.example             # Environment configuration template
└── README.md               # This file
```

## 🛠️ Prerequisites

- **Docker**: Latest version of Docker Desktop
- **Docker Compose**: Included with Docker Desktop
- **Cerebras API Key**: Required for AI model access
- **Node.js**: 16+ (for development)
- **Python**: 3.11+ (for development)

## ⚡ Quick Start with Docker

### 1. Clone and Configure

```bash
# Navigate to your desired directory
cd C:\Users\Ayush

# Create project directory if not exists
mkdir agentlab
cd agentlab

# Set up environment
cp .env.example .env
# Edit .env and add your CEREBRAS_API_KEY
```

### 2. Build and Run with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up --build -d
```

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 🏗️ Manual Setup Instructions

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements_new.txt

# Set environment variables
set CEREBRAS_API_KEY=your_api_key_here

# Run the backend server
uvicorn app:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup

```bash
# Navigate to frontend directory (new terminal)
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

## 🐳 Docker Commands Reference

### Build Individual Services

```bash
# Build backend only
docker build -t agentlab-backend ./backend

# Build frontend only  
docker build -t agentlab-frontend ./frontend

# Run backend container
docker run -p 8000:8000 --env-file .env agentlab-backend

# Run frontend container
docker run -p 3000:80 agentlab-frontend
```

### Docker Compose Operations

```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build

# View logs
docker-compose logs -f

# Scale services (if needed)
docker-compose up --scale backend=2
```

## 🔧 Development Commands

### Backend Development

```bash
cd backend

# Run with auto-reload
uvicorn app:socket_app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest

# Format code
black .

# Lint code
flake8
```

### Frontend Development

```bash
cd frontend

# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## 🌐 API Endpoints

- `GET /` - Root endpoint
- `GET /health` - Health check
- `POST /experiments/code-analysis` - Create code analysis experiment
- `POST /experiments/chat` - Create chat experiment  
- `GET /experiments` - Get all experiments
- `GET /experiments/{id}` - Get specific experiment

## 🔌 WebSocket Events

- `connect` - Client connection established
- `disconnect` - Client disconnected
- `experiment_updated` - Real-time experiment status updates

## 📊 Usage Examples

### Code Analysis Request
```json
{
  "code": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)"
}
```

### Chat Request
```json
{
  "prompt": "Explain the differences between Python lists and tuples"
}
```

## 🚀 Production Deployment

### Environment Variables
```bash
# Required
CEREBRAS_API_KEY=your_production_api_key

# Optional
DATABASE_URL=postgresql://user:pass@db:5432/agentlab
LOG_LEVEL=INFO
```

### Production Build
```bash
# Build production images
docker-compose -f docker-compose.yml build

# Deploy to production
docker-compose -f docker-compose.yml up -d
```

## 🛡️ Security Features

- **CORS Protection**: Configurable origins
- **Input Validation**: Pydantic models
- **Error Handling**: Comprehensive exception management
- **Health Checks**: Docker health monitoring
- **Non-root Containers**: Security-hardened images

## 📈 Performance Optimizations

- **Multi-stage Docker builds**: Optimized image sizes
- **Static file caching**: Nginx configuration
- **WebSocket efficiency**: Real-time updates
- **Database indexing**: Optimized queries
- **Frontend code splitting**: React optimizations

## 🎯 Hackathon Highlights

1. **Cerebras Integration**: Advanced code analysis using state-of-the-art models
2. **Llama Chat**: Conversational AI powered by Meta's Llama
3. **Docker Excellence**: Production-ready containerization
4. **Real-time Experience**: WebSocket-powered live updates
5. **Modern Architecture**: FastAPI + React + Docker

## 🏅 Winning Features

- **Dual AI Tracks**: Showcases both sponsor technologies
- **Professional UI/UX**: Modern, intuitive interface  
- **Scalable Architecture**: Docker-based microservices
- **Real-time Capabilities**: Live experiment tracking
- **Production Ready**: Complete CI/CD pipeline support

## 📞 Support & Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in docker-compose.yml
2. **API key issues**: Verify CEREBRAS_API_KEY in .env
3. **WebSocket connection**: Check CORS settings
4. **Build failures**: Ensure Docker has sufficient memory

### Logs and Debugging

```bash
# View all service logs
docker-compose logs

# View specific service logs  
docker-compose logs backend
docker-compose logs frontend

# Follow logs in real-time
docker-compose logs -f backend
```

## 🤝 Contributing

Built for FutureStack'25 GenAI Hackathon. Contributions welcome!

## 📄 License

MIT License - See LICENSE file for details

---

**🏆 AgentLab Team - FutureStack'25 GenAI Hackathon Submission**