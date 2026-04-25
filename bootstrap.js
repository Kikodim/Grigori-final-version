import { loadEnv } from "./load-env.js";

loadEnv();
await import("./server.js");
