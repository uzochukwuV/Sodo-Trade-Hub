import { createApp } from "./app.js";

const port = Number(process.env["GUARDIAN_PORT"] ?? process.env["PORT"] ?? 9100);
createApp().listen(port, "0.0.0.0", () => {
  console.log(`guardian-api listening on ${port}`);
});
