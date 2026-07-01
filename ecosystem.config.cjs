module.exports = {
  apps: [
    {
      name: "aulia-backend",
      script: "backend/dist/main.js",
    },
    {
      name: "aulia-frontend",
      script: "node_modules/vite/bin/vite.js",
      args: "--config frontend/vite.config.ts --host",
      cwd: "./"
    }
  ]
}
