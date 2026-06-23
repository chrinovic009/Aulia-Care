module.exports = {
  apps: [
    {
      name: "d7-backend",
      script: "backend/dist/main.js",
    },
    {
      name: "d7-frontend",
      script: "node_modules/vite/bin/vite.js",
      args: "--config frontend/vite.config.ts --host",
      cwd: "./"
    }
  ]
}
