import express from "express";
import cors from "cors";
import routes from "./routes";
import { clerkInit } from "./middleware/auth.middleware";
import { clerkMiddleware } from "@clerk/express";


const app = express();
app.use(cors());
app.use(express.json());
// app.use(clerkInit);
app.use(clerkMiddleware());

app.use("/", routes);

export default app;