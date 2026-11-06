FROM node:20-slim
RUN apt-get update && apt-get install -y python3 gcc g++ perl gawk sqlite3 bash && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
