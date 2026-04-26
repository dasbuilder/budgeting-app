#!/bin/bash

project_root="$PWD"
# Start backend
source "${project_root}/backend/venv/bin/activate"
python "${project_root}/backend/app.py" &
BACKEND_PID=$!


# Start frontend
cd "${project_root}/frontend" && npm run dev &
FRONTEND_PID=$!

# Kill both on exit
trap "kill -TERM $BACKEND_PID $FRONTEND_PID" EXIT

wait